# PrepVerse — Design 8: Skill Assessment & Profile Evolution

**Status:** LOCKED. This is the canonical skill-evolution contract.

---

## §1. Skill Record Shape

```text
skill (embedded in User.currentSkillProfile.skills[])
├── skillKey: string
├── sources: (RESUME | INTERVIEW)[]     // unique values only
├── assessed: boolean
├── level: BEGINNER | INTERMEDIATE | ADVANCED | null
├── potentialGap: boolean                // M5.5 — at-risk neighborhood: the
│                                       // latest interview assessed this skill
│                                       // with only 'missing' addressed signals
│                                       // (§9a)
├── evidenceLog: EvidenceEntry[]        // rolling window, max 5, newest last
└── lastAssessed: Date | null
```

`assessed` means "we have interview evidence about this skill," not "confirmed competence."

Resume-derived skills without interview evidence remain inventory entries with `assessed: false` and `level: null`. They do not count toward skill coverage.

---

## §2. Evidence Aggregation — per interview, per skill

Gemini returns qualitative `topicAssessments[].quality` values only:

```text
missing → 0
weak    → 1
good    → 2
strong  → 3
```

The backend performs this deterministic mapping after schema validation.

Within one interview, multiple answers can assess the same skill. They are aggregated into **one evidence event for that skill for that interview**:

```text
Gemini topicAssessments per answer
        ↓
quality → 0/1/2/3
        ↓
group by skillKey within the interview
        ↓
signal = average(mapped signals where addressed === true)
        ↓
one EvidenceEntry for that skill + interview
```

`signal` is continuous from `0.0` to `3.0`.

**Hard invariant:** if a skill has zero `topicAssessments` with `addressed: true` in an interview, **no evidence event is created** for that skill in that interview. Never convert an empty set into `signal = 0`. Silence is not negative evidence.

`addressed: true` with `quality: missing` is negative evidence and contributes `0`.

### Display label

The stored value is the continuous signal. A display label is derived:

```text
0.00–0.74 → missing
0.75–1.49 → weak
1.50–2.49 → good
2.50–3.00 → strong
```

---

## §3. Evidence Log Entry

```text
EvidenceEntry
├── interviewId
├── answerIds: string[]      // answers that contributed to this signal
├── signal: number           // 0.0–3.0
└── assessedAt: Date
```

Per-question detail is retained in the interview report; it is not treated as independent progression samples.

---

## §4. First Evidence vs. Subsequent Evidence

### First evidence

Always:

```text
assessed = true
level = BEGINNER
```

This is unconditional, regardless of signal magnitude.

### Subsequent evidence

```text
rollingAvg = average(last 5 interview-level evidence signals)

targetLevel =
    rollingAvg < 1.5        → BEGINNER
    1.5 ≤ rollingAvg < 2.5 → INTERMEDIATE
    rollingAvg ≥ 2.5        → ADVANCED

level = at most one tier toward targetLevel
```

A skill can therefore move:

```text
BEGINNER → INTERMEDIATE → ADVANCED
```

but never:

```text
BEGINNER → ADVANCED
```

in a single evaluation cycle.

The one-tier cap is a deliberate UX/trust decision, not an empirically derived mathematical rule.

---

## §5. Rolling Evidence Window

Only the latest **5 interview-level evidence events** are retained per skill. The oldest event is dropped FIFO.

Recency weighting and time-based decay are explicitly deferred.

---

## §6. Skill Inventory vs. Weighted Skill Coverage

### Inventory

Everything claimed on the resume or assessed during interviews.

### Coverage

A required role skill is covered only when:

```text
skill.assessed === true
AND
rank(skill.level) >= rank(requiredSkill.minimumLevel)
```

Resume-only claims contribute `0` to coverage.

Coverage is weighted:

```text
coveredWeight =
    Σ requiredSkill.weight
    for required skills satisfying covered(...)

totalWeight =
    Σ requiredSkill.weight
    for all required skills

skillCoverage =
    (coveredWeight / totalWeight) × 100
```

`requiredSkill.weight` therefore directly influences the readiness score's `skillCoverage` component.

---

## §7. `skillGaps`

```text
skillGaps =
    required skill where:
      not in profile
      OR not assessed
      OR assessed AND level < requiredSkill.minimumLevel
```

The gap list is derived deterministically from the role catalog and current skill profile. It is not trusted from Gemini.

---

## §8. RoleSkillCatalog requirement

Each required skill must define:

```text
{
  skillKey,
  weight,
  minimumLevel
}
```

where `minimumLevel` is one of:

```text
BEGINNER | INTERMEDIATE | ADVANCED
```

This is required by the coverage and gap algorithms.

---

## §9. Concurrency and profile synchronization

Two interviews completing near-simultaneously must not lose evidence through a read-modify-write race.

`SkillProfileService.updateFromInterview()` therefore performs the profile update inside a MongoDB transaction.

Interview completion and profile synchronization are separate:

```text
Interview evaluation succeeds
        ↓
Interview.status = COMPLETED
Interview.report.profileSyncStatus = PENDING
        ↓
SkillProfileService transaction
        ↓
COMPLETED or FAILED
```

A profile-sync failure does **not** invalidate the completed interview. It is a derived-state failure and must be retryable.

**FAILED semantics (M5.5 resolution):** `profileSyncStatus: FAILED` is **terminal for MVP**. There is no automatic retry, no retry-on-read, and no retry endpoint. The completed interview and its report remain valid; the FAILED flag means only that skill-profile synchronization did not complete. "Retryable" means re-invocation is safe (evidence is deduplicated by interviewId), so a future milestone may add explicit re-processing — it does not require a retry mechanism in MVP.

**Caller behavior on sync failure (M5.5 resolution):** the interview submission flow invokes synchronization synchronously after the COMPLETED write (docs/05 §7). If it throws, the caller preserves `Interview.status = COMPLETED` and the completed report, marks `report.profileSyncStatus = FAILED` via a best-effort write (the synchronization transaction has already rolled back — this write is not part of it), and does not convert the interview to `EVALUATION_FAILED`. The submission remains a successful completion from the interview's perspective. If the caller's separate FAILED-marker write itself fails after `updateFromInterview()` has already rolled back, the interview may remain observably `profileSyncStatus = PENDING` indefinitely; this is an accepted MVP limitation and does not introduce a separate recovery mechanism.

### §9a. Synchronization mechanics (M5.5 resolution)

**Sync markers.** `SkillProfileService` writes an ACTIVE marker into `Interview.report.skillSync = { active, startedAt, completedAt, failedAt, reason }` before starting the transaction (via `updateOne` — markers are observability, not status-CAS transitions) and clears it (with `profileSyncStatus: COMPLETED`) inside the transaction, so a crash between "profile updated" and "marker cleared" rolls back both. The marker write is not a precondition: if it fails, the sync proceeds (logged only).

**BUSY / EXPIRED reads (service-level, no HTTP endpoint).** `getSyncStatus(userId, interviewId)` reads the marker: an unfinished marker answers `BUSY` while its age is ≤ `SYNC_MARKER_STALE_MS` and `EXPIRED` once it exceeds the window (the sync that wrote it crashed); without an unfinished marker it reports the persisted `profileSyncStatus` (`PENDING` / `COMPLETED` / `FAILED`). EXPIRED markers are not auto-cleared in MVP.

**Transaction order.** Inside the transaction the writes are: user profile first (`user.save({ session })`), then the interview's `COMPLETED` flag + marker clear (`interview.save({ session })`). A mid-transaction failure rolls back both.

**FAILED classification.** `wrapPersistenceError(error)` decides: only persistence-level errors convert a sync to `FAILED` (via `markSyncFailed` — a best-effort standalone write that never downgrades a `COMPLETED` sync). Domain errors (`NotFoundError` / `ValidationError` / `ConflictError`) are rethrown untouched — they are caller bugs, not persistence failures. The FAILED marker stores a sanitized reason (error code/name, never raw error text) in `report.skillSync.reason`.

**`potentialGap` (new skill-record state, docs/05 §2).** The normalization layer flags a skill as a `potentialGap` when the interview's only addressed `topicAssessments` signal for it was `missing` (negative evidence, docs/08 §2) — i.e. the skill was assessed but never reached a weak-or-better neighborhood. `SkillProfileService` sets `skill.potentialGap = true` on the profile record. Rolls into `skill.assessed`/`level` semantics unchanged: a gap-flagged skill still carries its (0-signal) evidence event like any other skill.

**Normalization path (locked rule, layer boundaries).** `topic → skill` = AnswerEvaluator, `skill → interview` = `server/src/domain/skills/evidenceNormalizer.js` (pure, persistence-free: `normalizeInterviewEvidence({ answers }) → { events: [{ skillKey, signal, answerIds }], potentialGaps: [skillKey] }`), `interview → profile` = `SkillProfileService.updateFromInterview({ userId, interviewId, events, potentialGaps })`. The submit flow calls them in that order after the COMPLETED CAS, then re-reads the interview so the response reflects the persisted post-sync state (docs/02 §3).

---

## §10. Explicitly Deferred

- Skill decay.
- Recency-weighted averaging.
- Separate `SkillAssessmentHistory` collection.
- Categorized gap reason codes.
- Cross-interview question deduplication.

These are future refinements, not hidden MVP requirements.

---

## Locked implementation rule of thumb

```text
topic → skill        = AnswerEvaluator
skill → interview    = backend normalization/aggregation
interview → profile  = SkillProfileService
```

Each layer has one responsibility and downstream layers never reinterpret upstream output.
