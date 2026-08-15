// SkillProfileService — deterministic maintenance of User.currentSkillProfile
// from interview evidence (M4.5). docs/08-skill-evolution.md is the contract.
//
// Boundary (docs/08 locked rule): this is the "interview → profile" layer. It
// receives PRE-NORMALIZED evidence events { skillKey, signal, answerIds }
// (one event per skill per interview, produced upstream by the interview→skill
// backend normalization layer per docs/08 §2). It never reads raw
// topicAssessments — downstream layers never reinterpret upstream output.
//
// Scope: service-layer only. No HTTP endpoint (docs/02 §3 defines no skill
// profile write route); the trigger surface is the M5 orchestrator calling
// updateFromInterview() after Interview.status reaches COMPLETED (docs/05 §7
// cross-check, docs/08 §9). No AI, no storage.
//
// Owned writes: User.currentSkillProfile, and Interview.report.profileSyncStatus
// (set to COMPLETED on success per docs/08 §9). Read-only dependency:
// RoleSkillCatalog — the deterministic denominator for skillGaps (docs/08 §7).
//
// Concurrency (AGENTS.md rule #9, docs/08 §8): every update runs inside a
// MongoDB transaction so near-simultaneous interview completions cannot lose
// evidence through a read-modify-write race. A profile-sync failure does not
// invalidate the completed interview (docs/08 §9); the caller marks
// profileSyncStatus = FAILED when this service throws, and the service itself
// is retryable (evidence is deduplicated by interviewId).
const mongoose = require('mongoose');
const User = require('../users/user.model');
const Interview = require('../interviews/interview.model');
const RoleSkillCatalog = require('./roleSkillCatalog.model');
const { NotFoundError, ValidationError, ConflictError } = require('../../utils/errors');

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

// Fold one interview's pre-normalized evidence events into the user's
// currentSkillProfile, inside a MongoDB transaction. Returns the updated
// currentSkillProfile (skills, skillGaps, updatedAt) so callers can persist or
// report the fresh state without a follow-up read.
async function updateFromInterview({ userId, interviewId, events }) {
  if (!isValidObjectId(userId)) {
    throw new ValidationError('userId must be a valid ObjectId', { field: 'userId' });
  }
  if (!isValidObjectId(interviewId)) {
    throw new ValidationError('interviewId must be a valid ObjectId', { field: 'interviewId' });
  }
  validateEvents(events);

  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      const user = await User.findById(userId).session(session);
      if (!user) throw new NotFoundError('User not found');

      // Ownership enforced at the service layer, every time (AGENTS.md rule #4):
      // a mismatch returns 404, not 403.
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
      for (const event of events) {
        let skill = skillsByKey.get(event.skillKey);

        // First evidence for this skill (no prior interview evidence): assessed
        // flips true, level is BEGINNER unconditionally — regardless of signal
        // magnitude (docs/08 §4).
        const firstEvidence = !skill || !skill.evidenceLog || skill.evidenceLog.length === 0;

        // Idempotency (made decision — docs/08 defines no duplicate-processing
        // rule, so re-applying the same interview's evidence is a no-op, which
        // is what makes this service retryable per docs/08 §9).
        if (skill && skill.evidenceLog.some((entry) => String(entry.interviewId) === String(interviewId))) {
          continue;
        }

        if (!skill) {
          skill = {
            skillKey: event.skillKey,
            sources: [],
            assessed: false,
            level: null,
            evidenceLog: [],
            lastAssessed: null,
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

      // docs/08 §9: the transaction's success completes the profile sync. A
      // failure rolls back the whole update (profile unchanged) and leaves the
      // interview PENDING so the orchestrator can retry or mark FAILED.
      interview.report.profileSyncStatus = 'COMPLETED';
      await interview.save({ session });

      result = user.currentSkillProfile;
    });
    return result;
  } finally {
    await session.endSession();
  }
}

module.exports = { updateFromInterview };
