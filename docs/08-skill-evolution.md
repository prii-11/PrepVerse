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
