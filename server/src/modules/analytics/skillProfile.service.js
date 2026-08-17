// SkillProfileService — deterministic maintenance of User.currentSkillProfile
// from interview evidence (M4.5 scaffold, M5.5 milestone: synchronous wiring
// into the interview submission flow, sync markers with BUSY/EXPIRED semantics,
// potentialGap state, FAILED-marker path). docs/08-skill-evolution.md is the
// contract.
//
// Boundary (docs/08 locked rule): this is the "interview → profile" layer. It
// receives PRE-NORMALIZED evidence events { skillKey, signal, answerIds }
// (one event per skill per interview, produced upstream by the interview→skill
// backend normalization layer — evidenceNormalizer.js, docs/08 §2). It never
// reads raw topicAssessments — downstream layers never reinterpret upstream
// output.
//
// Scope: service-layer only. No HTTP endpoint (docs/02 §3 defines no skill
// profile write route); the trigger surface is the M5.5 interview submission
// flow calling updateFromInterview() after Interview.status reaches COMPLETED
// (docs/05 §7 cross-check, docs/08 §9).
//
// Owned writes: User.currentSkillProfile (skills, skillGaps, updatedAt) and
// Interview.report.profileSyncStatus (COMPLETED on success). Read-only
// dependency: RoleSkillCatalog — the deterministic denominator for skillGaps
// (docs/08 §7).
//
// Sync markers (docs/08 §9a, M5.5): Interview.report.skillSync
// { active, startedAt, completedAt, failedAt, reason }. An ACTIVE marker is
// written before the transaction and cleared (with profileSyncStatus:
// COMPLETED) inside it. getSyncStatus() reads the marker: an unfinished
// marker answers BUSY while fresh and EXPIRED once it exceeds
// SYNC_MARKER_STALE_MS — without a marker, it reports the persisted
// profileSyncStatus. A persistence-level failure converts to
// profileSyncStatus: FAILED via a best-effort marker write (docs/08 §9) and
// the transaction's rollback leaves the profile untouched; the completed
// interview and its report remain valid.
//
// Concurrency (AGENTS.md rule #9, docs/08 §9): every update runs inside a
// MongoDB transaction so near-simultaneous interview completions cannot lose
// evidence through a read-modify-write race. Re-invocation is safe: evidence
// is deduplicated by interviewId (docs/08 §9 — FAILED is terminal for MVP,
// no auto-retry; this is only what makes a future explicit re-process safe).
const mongoose = require('mongoose');
const User = require('../users/user.model');
const Interview = require('../interviews/interview.model');
const RoleSkillCatalog = require('./roleSkillCatalog.model');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');

// docs/08 §9a: an ACTIVE marker older than this is a stale (crashed) sync —
// getSyncStatus() then answers EXPIRED instead of BUSY.
const SYNC_MARKER_STALE_MS = 10 * 60 * 1000;

// Canonical level ordering — MUST match analytics.service.js (M4.4). The M4.4
// coverage logic reads these same levels through Map(skillKey → skill); a
// mismatch here would silently break readiness coverage.
const LEVEL_RANK = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

// docs/08 §5: rolling window of the latest 5 interview-level evidence events
// per skill; the oldest event is dropped FIFO (newest last).
const EVIDENCE_WINDOW = 5;

// docs/08 §4: target-level thresholds applied to the rolling average.
const TARGET_THRESHOLDS = [
  { max: 1.5, level: 'BEGINNER' },
  { max: 2.5, level: 'INTERMEDIATE' },
  { max: Infinity, level: 'ADVANCED' },
];

function targetLevelFromRollingAvg(avg) {
  for (const { max, level } of TARGET_THRESHOLDS) {
    if (avg < max) return level;
  }
  return 'ADVANCED';
}

// docs/08 §4 one-tier cap: the level moves at most one tier toward the target
// level per evaluation cycle (BEGINNER → INTERMEDIATE → ADVANCED, never a jump).
function nextLevel(currentLevel, targetLevel) {
  const currentRank = LEVEL_RANK[currentLevel];
  const targetRank = LEVEL_RANK[targetLevel];
  if (currentRank === targetRank) return currentLevel;
  const nextRank = targetRank > currentRank ? currentRank + 1 : currentRank - 1;
  return Object.keys(LEVEL_RANK).find((level) => LEVEL_RANK[level] === nextRank);
}

function rollingAverage(evidenceLog) {
  if (evidenceLog.length === 0) return null;
  return evidenceLog.reduce((sum, entry) => sum + entry.signal, 0) / evidenceLog.length;
}

function isValidObjectId(value) {
  return mongoose.Types.ObjectId.isValid(String(value));
}

// docs/08 §7: the gap list, derived deterministically from the role catalog and
// the current skill profile. A required skill is a gap when it is missing from
// the profile, unassessed, or assessed below the required minimum level.
// Persisted as [String] of canonical skillKeys, in catalog order.
function computeSkillGaps(catalog, skillsByKey) {
  const gaps = [];
  for (const required of catalog.requiredSkills) {
    const skill = skillsByKey.get(required.skillKey);
    const isGap =
      !skill || skill.assessed !== true || skill.level == null
        ? true
        : LEVEL_RANK[skill.level] < LEVEL_RANK[required.minimumLevel];
    if (isGap) gaps.push(required.skillKey);
  }
  return gaps;
}

function validateEvents(events) {
  if (!Array.isArray(events)) {
    throw new ValidationError('events must be an array', { field: 'events' });
  }
  for (const event of events) {
    if (!event || typeof event.skillKey !== 'string' || event.skillKey.trim() === '') {
      throw new ValidationError('each event needs a non-empty skillKey', { field: 'events[].skillKey' });
    }
    if (typeof event.signal !== 'number' || !Number.isFinite(event.signal) || event.signal < 0 || event.signal > 3) {
      throw new ValidationError('signal must be a finite number in [0, 3]', { field: 'events[].signal' });
    }
    if (!Array.isArray(event.answerIds) || event.answerIds.length === 0) {
      throw new ValidationError('each event needs a non-empty answerIds array', { field: 'events[].answerIds' });
    }
  }
}

// docs/08 §9a: persistence-level errors are the ONLY ones that convert a sync
// into FAILED. Domain errors (not-found, bad state, invalid input) are marked
// and rethrown untouched — they are caller bugs, not persistence failures.
function wrapPersistenceError(error) {
  return !(error instanceof NotFoundError || error instanceof ValidationError || error instanceof ConflictError);
}

// Best-effort FAILED marker (docs/08 §9): written OUTSIDE the transaction,
// after it has already rolled back. Never downgrades a COMPLETED sync.
async function markSyncFailed(userId, interviewId, error, syncStartedAt) {
  const reason = error && (error.code || error.name) ? error.code || error.name : 'SYNC_FAILED';
  await Interview.findOneAndUpdate(
    { _id: interviewId, userId, 'report.profileSyncStatus': { $ne: 'COMPLETED' } },
    {
      $set: {
        'report.profileSyncStatus': 'FAILED',
        'report.skillSync.active': false,
        'report.skillSync.failedAt': new Date(),
        'report.skillSync.reason': reason,
        'report.skillSync.startedAt': syncStartedAt ? syncStartedAt : new Date(),
      },
    }
  );
}

// docs/08 §9a sync-marker read: BUSY while a fresh ACTIVE marker exists,
// EXPIRED once it has outlived SYNC_MARKER_STALE_MS (the write that started
// the sync crashed), otherwise the persisted profileSyncStatus. Read-only —
// EXPIRED markers are NOT cleared here; recovery is a future milestone.
async function getSyncStatus(userId, interviewId) {
  const interview = await Interview.findOne({ _id: interviewId, userId }, { 'report.skillSync': 1, 'report.profileSyncStatus': 1 });
  if (!interview) {
    throw new NotFoundError('Interview not found');
  }
  const skillSync = interview.report && interview.report.skillSync ? interview.report.skillSync : {};
  if (skillSync.active === true && !skillSync.completedAt && !skillSync.failedAt) {
    const started = skillSync.startedAt ? new Date(skillSync.startedAt).getTime() : Number.NaN;
    const age = Number.isFinite(started) ? Date.now() - started : Number.POSITIVE_INFINITY;
    return { status: age > SYNC_MARKER_STALE_MS ? 'EXPIRED' : 'BUSY' };
  }
  return { status: interview.report && interview.report.profileSyncStatus ? interview.report.profileSyncStatus : 'PENDING' };
}

// Fold one interview's pre-normalized evidence events into the user's
// currentSkillProfile, inside a MongoDB transaction. Returns the updated
// currentSkillProfile (skills, skillGaps, updatedAt) so callers can persist or
// report the fresh state without a follow-up read.
async function updateFromInterview({ userId, interviewId, events, potentialGaps = [] }) {
  if (!isValidObjectId(userId)) {
    throw new ValidationError('userId must be a valid ObjectId', { field: 'userId' });
  }
  if (!isValidObjectId(interviewId)) {
    throw new ValidationError('interviewId must be a valid ObjectId', { field: 'interviewId' });
  }
  validateEvents(events);

  // ACTIVE sync marker (docs/08 §9a) — written BEFORE the transaction so a
  // crashed mid-sync process leaves an observable BUSY/EXPIRED marker. The
  // marker write is observability, not a precondition: if it fails the sync
  // proceeds (logged, never aborted on marker problems).
  const syncStartedAt = new Date();
  try {
    // updateOne — markers are observability, not status-CAS transitions, so
    // they stay out of the submission's CAS-gate sequence (docs/08 §9a).
    await Interview.updateOne(
      { _id: interviewId, userId },
      {
        $set: {
          'report.skillSync.active': true,
          'report.skillSync.startedAt': syncStartedAt,
          'report.skillSync.completedAt': null,
          'report.skillSync.failedAt': null,
          'report.skillSync.reason': null,
        },
      }
    );
  } catch (markerError) {
    console.warn(`[skillProfile] failed to write ACTIVE sync marker: ${markerError.message}`);
  }

  const session = await mongoose.startSession();
  try {
    let result;
    try {
      await session.withTransaction(async () => {
        const user = await User.findById(userId).session(session);
        if (!user) throw new NotFoundError('User not found');

        // Ownership enforced at the service layer, every time (AGENTS.md rule #4):
        // a mismatch returns 404, not 403. Also constrains re-invocation: a
        // second sync for the same interviewId is safe by construction.
        const interview = await Interview.findOne({ _id: interviewId, userId }).session(session);
        if (!interview) throw new NotFoundError('Interview not found');
        if (interview.status !== 'COMPLETED') {
          throw new ConflictError(`Skill profile sync requires a COMPLETED interview (status=${interview.status})`);
        }
        if (!interview.report) {
          throw new ConflictError('Completed interview is missing its report');
        }

        const profile = user.currentSkillProfile || { skills: [], skillGaps: [] };
        const skillsByKey = new Map((profile.skills || []).map((skill) => [skill.skillKey, skill]));

        const now = new Date();
        const metrics = { eventsApplied: 0, skillsAssessed: 0, potentialGapsAdded: 0 };
        const assessedKeys = new Set();
        for (const event of events) {
          let skill = skillsByKey.get(event.skillKey);

          // Idempotency (made decision — docs/08 defines no duplicate-processing
          // rule, so re-applying the same interview's evidence is a no-op, which
          // is what makes this service retryable per docs/08 §9).
          if (skill && skill.evidenceLog.some((entry) => String(entry.interviewId) === String(interviewId))) {
            continue;
          }

          // First evidence for this skill (no prior interview evidence): assessed
          // flips true, level is BEGINNER unconditionally — regardless of signal
          // magnitude (docs/08 §4).
          const firstEvidence = !skill || !skill.evidenceLog || skill.evidenceLog.length === 0;

          if (!skill) {
            skill = {
              skillKey: event.skillKey,
              sources: [],
              assessed: false,
              level: null,
              evidenceLog: [],
              lastAssessed: null,
              potentialGap: false,
            };
            skillsByKey.set(event.skillKey, skill);
          }

          skill.assessed = true;
          skill.lastAssessed = now;
          if (!skill.sources.includes('INTERVIEW')) skill.sources.push('INTERVIEW');

          skill.evidenceLog.push({
            interviewId,
            answerIds: event.answerIds,
            signal: event.signal,
            assessedAt: now,
          });

          // docs/08 §5: keep only the latest EVIDENCE_WINDOW events, newest last.
          if (skill.evidenceLog.length > EVIDENCE_WINDOW) {
            skill.evidenceLog = skill.evidenceLog.slice(skill.evidenceLog.length - EVIDENCE_WINDOW);
          }

          if (firstEvidence) {
            skill.level = 'BEGINNER';
          } else {
            const targetLevel = targetLevelFromRollingAvg(rollingAverage(skill.evidenceLog));
            skill.level = nextLevel(skill.level, targetLevel);
          }

          metrics.eventsApplied += 1;
          if (!assessedKeys.has(event.skillKey)) {
            assessedKeys.add(event.skillKey);
            metrics.skillsAssessed += 1;
          }
        }

        // potentialGap (M5.5, docs/08 §9a): skills assessed this interview with
        // only 'missing' addressed signals move to the at-risk neighborhood.
        // Every flagged skill also produced an event, so it exists in the map.
        for (const skillKey of potentialGaps) {
          const skill = skillsByKey.get(skillKey);
          if (skill && !skill.potentialGap) {
            skill.potentialGap = true;
            metrics.potentialGapsAdded += 1;
          }
        }

        // Recompute + persist skillGaps (docs/08 §7) when a targetRole exists and
        // resolves in the catalog. With no targetRole there is no denominator, so
        // the gap list is empty — never a fabricated value.
        let skillGaps = [];
        const targetRole = user.profile && user.profile.targetRole;
        if (targetRole) {
          const catalog = await RoleSkillCatalog.findOne({ role: targetRole })
            .select('requiredSkills')
            .session(session)
            .lean();
          if (catalog && Array.isArray(catalog.requiredSkills)) {
            skillGaps = computeSkillGaps(catalog, skillsByKey);
          }
        }

        user.currentSkillProfile = {
          skills: Array.from(skillsByKey.values()),
          skillGaps,
          updatedAt: now,
        };
        await user.save({ session });

        // docs/08 §9: the transaction's success completes the profile sync, and
        // the ACTIVE marker is cleared in the SAME transaction — a crash between
        // "profile updated" and "marker cleared" rolls back both. A failure
        // rolls back the whole update (profile unchanged) and leaves the
        // interview PENDING so the caller marks FAILED.
        interview.report.profileSyncStatus = 'COMPLETED';
        interview.report.skillSync = {
          active: false,
          startedAt: syncStartedAt,
          completedAt: now,
        };
        await interview.save({ session });

        result = { status: 'COMPLETED', profile: user.currentSkillProfile, metrics };
      });
    } catch (error) {
      // docs/08 §9a: persistence-level errors convert to FAILED (best-effort
      // marker write, outside the transaction — it has already rolled back).
      // Domain errors are rethrown untouched; the caller's failure handling
      // still applies (submitInterview guards the sync itself).
      if (wrapPersistenceError(error)) {
        try {
          await markSyncFailed(userId, interviewId, error, syncStartedAt);
        } catch (markError) {
          console.error(`[skillProfile] failed to write FAILED marker: ${markError.message}`);
        }
      }
      throw error;
    }
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { updateFromInterview, getSyncStatus, markSyncFailed, wrapPersistenceError };