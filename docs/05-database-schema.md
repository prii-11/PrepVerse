# PrepVerse — Design Doc 5: Database Schema

*Incorporates all 8 corrections from Design 7 review, and the final stateless-JWT decision (no RefreshToken collection needed). Written to directly support the AI loop, interview-level skill-evidence aggregation and answer-level evaluation lifecycle, and the RoleSkillCatalog source of truth.*

---

## 1. Collections overview

```
users
resumes
interviews
roleskillcatalogs   ← new, per Design 7 correction #5
aiexecutions
```

No `refreshtokens` collection — final auth decision is stateless short-lived JWT (documented limitation: no server-side revocation before expiry).

---

## 2. `User`

```js
{
  _id: ObjectId,
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  profileCompleted: { type: Boolean, default: false },

  profile: {
    targetRole: { type: String },          // validated against RoleSkillCatalog.role; not arbitrary free text
    experienceLevel: { type: String, enum: ['Student', 'Entry', 'Junior'] }
  },

  currentSkillProfile: {
    skills: [{
      skillKey: { type: String, required: true },
      sources: [{ type: String, enum: ['RESUME', 'INTERVIEW'], required: true }], // service enforces uniqueness
      assessed: { type: Boolean, default: false },
      level: { type: String, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', null], default: null },
      evidenceLog: [{
        interviewId: { type: ObjectId, ref: 'Interview' },
        answerIds: [{ type: ObjectId }],
        signal: { type: Number, min: 0, max: 3 },
        assessedAt: Date
      }],
      lastAssessed: Date
    }],
    skillGaps: [String],
    updatedAt: Date
  },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

**Notes**
- No `readinessScore` field — confirmed, computed on read by `ReadinessService`, never stored.
- `currentSkillProfile` is the *current* snapshot only. Historical snapshots aren't a separate collection for MVP — history is reconstructed from completed `Interview.report` documents (each report is effectively a dated skill-evidence event). Revisit as a separate `SkillAssessmentHistory` collection only if progress analytics need more than what Interview reports provide.
- Index: `{ email: 1 }` unique (already implied by `unique: true`).

---

## 3. `Resume`

```js
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User', required: true, index: true },

  storageKey: { type: String, required: true },   // Supabase Storage path
  originalFilename: String,
  mimeType: String,
  size: Number,

  status: { type: String, enum: ['UPLOADED', 'ANALYZED', 'FAILED'], default: 'UPLOADED' },
  // Note: no PROCESSING — MVP resume upload is synchronous (Design 6 correction #2)

  analysis: {
    extractedSkills: [String],
    experienceSummary: String,
    projects: [{ name: String, description: String, technologies: [String] }],
    strengths: [String],
    skillGaps: [String],
    promptVersion: String,     // e.g. "resume-analysis-v1"
    model: String              // e.g. "gemini-2.5-flash"
  },

  failureReason: String,       // set only if status: FAILED — errorCode, not raw model output

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

**Index:** `{ userId: 1, createdAt: -1 }` — supports "list my resumes, most recent first" and every ownership check.

**No raw resume text and no raw Gemini response stored here** — text is extracted transiently at request time, passed to the AI Orchestrator, and discarded once `analysis` is persisted. (If resume re-analysis becomes a feature later, the *file* is already in Supabase Storage and can be re-extracted — no need to duplicate the text in MongoDB.)

---

## 4. `Interview`

```js
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User', required: true, index: true },

  targetRole: String,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },

  status: {
    type: String,
    enum: ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'COMPLETED',
           'EVALUATION_FAILED', 'CANCELLED'],
    default: 'CREATED'
  },

  questionGeneration: {
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
    promptVersion: String,
    model: String
  },

  questions: [{
    _id: { type: ObjectId, auto: true },   // server-generated (Design 7 correction #3)
    text: String,
    category: String,
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
    expectedTopics: [{
        skillKey: { type: String, required: true },
        topic: { type: String, required: true }
      }]
  }],

  answers: [{
    questionId: { type: ObjectId, required: true },   // references questions[]._id
    text: String,
    evaluationStatus: {
      type: String,
      enum: ['PENDING', 'EVALUATING', 'COMPLETED', 'FAILED'],
      default: 'PENDING'
    },
    evaluation: {
      correctness: Number,        // 0-100, only ever a value that PASSED schema validation
      technicalDepth: Number,
      communication: Number,
      strengths: [String],
      weaknesses: [String],
      improvementTip: String,
      topicAssessments: [{
        skillKey: { type: String, required: true },
        topic: String,
        addressed: Boolean,
        quality: { type: String, enum: ['missing', 'weak', 'good', 'strong'] }
      }],
      promptVersion: String,
      model: String
    },
    evaluatedAt: Date
  }],

  report: {
    overallScore: Number,          // computed: avg over COMPLETED answers of (0.50×correctness + 0.30×technicalDepth + 0.20×communication) — resolved in docs/07 §4, supersedes a dangling 0.70/0.30 reference
    technicalScore: Number,        // computed: avg over COMPLETED answers of (0.60×correctness + 0.40×technicalDepth)
    communicationScore: Number,    // computed: avg over COMPLETED answers of communication — resolved in docs/07 §4
    strengths: [String],
    weaknesses: [String],
    recommendations: [String],
    generatedAt: Date,
    profileSyncStatus: {           // per Design 8 (revised) — nested under report,
      type: String,                // NOT a top-level Interview field. Independent of
      enum: ['PENDING', 'COMPLETED', 'FAILED'],  // Interview.status: an interview can be
      default: 'PENDING'           // COMPLETED while its skill-profile sync is still
    }                               // PENDING or retrying after a FAILED attempt.
  },

  startedAt: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}
```

**Embedded-shape invariants from Design 7/8:** `expectedTopics` entries are canonical `{ skillKey, topic }` objects. `topicAssessments[].skillKey` values are unique within one answer evaluation and must belong to that question's expected-topic skill-key set. `sources[]` contains unique values; these are service/schema validation invariants, not MongoDB unique indexes on individual array elements.

**Why `report` isn't purely a Gemini output:** `report.overallScore`/`technicalScore`/`communicationScore` are computed server-side by averaging the per-answer `evaluation` sub-scores (which themselves already passed validation) — `strengths`/`weaknesses`/`recommendations` at the report level are deterministically aggregated from the per-answer strengths/weaknesses (**resolved** during the Design 5 review round: a 4th "REPORT_SUMMARIZATION" Gemini call was explicitly rejected — this is pure backend aggregation, not an LLM call. The "or a final small Gemini summarization call... open question" language that used to appear here was never actually decided that way and is removed).

**Index:** `{ userId: 1, status: 1, createdAt: -1 }` — supports listing, filtering by status, and the readiness/progress queries (which need "recent completed interviews for this user").

**Concurrency/idempotency enforcement (Design 6 correction #7):** the service layer checks `status` before any transition — e.g. `submit` only succeeds from `IN_PROGRESS`; a second concurrent `submit` call finds `status !== 'IN_PROGRESS'` and returns `409`. This is an application-layer check, not a MongoDB-level constraint — acceptable for MVP traffic levels; a `findOneAndUpdate` with a status-matching filter (`{ _id, status: 'IN_PROGRESS' }`) gives this a real atomicity guarantee cheaply, worth using here rather than a plain "read-then-write."

---

## 5. `RoleSkillCatalog` (new — Design 7 correction #5)

```js
{
  _id: ObjectId,
  role: { type: String, required: true, unique: true, index: true },   // e.g. "Backend Developer"
  requiredSkills: [{
    skillKey: { type: String, required: true },
    weight: { type: Number, required: true, min: 0 },
    minimumLevel: { type: String, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], required: true }
  }],
  updatedAt: Date
}
```

This is a small, manually curated seed collection (a handful of common roles: Backend Developer, Frontend Developer, Full-Stack, Data/ML, etc.) — not user-editable in MVP, not AI-generated. It's the deterministic denominator for `skillCoverage`. Gemini's resume analysis can *suggest* additions, but nothing writes to this collection automatically — a human (you) curates it, at least for MVP.

**Resolved (was previously left as an open question in this doc — decision made during Design 5's review round but never back-filled here):** `targetRole` is **catalog-backed, not free text**. Onboarding/profile UI presents a dropdown of exactly the roles that exist in `RoleSkillCatalog` — there is no text-entry path that could produce an unrecognized value in normal use. If a `targetRole` value is submitted that doesn't exactly match a `RoleSkillCatalog.role`, the request is **rejected with a `ValidationError`** listing the valid options — no fuzzy-matching, no silent fallback to a generic skill set. This keeps `skillCoverage`'s denominator (§ above) deterministic and prevents an unrecognized role from silently producing meaningless coverage numbers.

---

## 6. `AIExecution`

```js
{
  _id: ObjectId,
  userId: { type: ObjectId, ref: 'User', required: true, index: true },
  operation: { type: String, enum: ['RESUME_ANALYSIS', 'QUESTION_GENERATION', 'ANSWER_EVALUATION'] },
  entityType: { type: String, enum: ['RESUME', 'INTERVIEW'] },
  entityId: { type: ObjectId, index: true },

  provider: { type: String, default: 'gemini' },
  model: String,
  promptVersion: String,

  status: { type: String, enum: ['SUCCESS', 'FAILED'] },
  latencyMs: Number,
  tokenUsage: { input: Number, output: Number },
  errorCode: String,           // set only on FAILED — e.g. "SCHEMA_VALIDATION_FAILED", "RATE_LIMITED"

  // Sanitized only — never raw prompt text, never raw resume/answer content,
  // never unrestricted model output (Design 6 §4.3, applies to dev AND prod)
  outputSummary: {
    // small structured summary useful for debugging, e.g.
    // { fieldsReturned: [...], validationPassed: Boolean }
    type: Object
  },

  createdAt: { type: Date, default: Date.now }
}
```

**Index:** `{ entityType: 1, entityId: 1 }` — supports "show me every AI call related to this specific interview/resume," which is the debugging use case this collection exists for. Also `{ userId: 1, createdAt: -1 }` for the AI-abuse-monitoring use case (Design 6 §4.2).

---

## 7. Cross-check against the AI loop (does this schema actually support it end-to-end?)

```
Resume upload → Resume.status: UPLOADED
             → AI Orchestrator (RESUME_ANALYSIS) → AIExecution logged
             → Resume.analysis populated, Resume.status: ANALYZED
             → User.currentSkillProfile updated (SkillProfileService receives pre-normalized evidence events, not raw topicAssessments — see the corrected note below §7's cross-check diagram; RoleSkillCatalog supplies the required-skill universe; resume analysis contributes inventory/source information but does not itself establish assessed skill levels)

Interview created → Interview.status: CREATED, questionGeneration.status: PENDING
                  → AI Orchestrator (QUESTION_GENERATION), reads
                    User.currentSkillProfile + past Interview.report.weaknesses
                  → AIExecution logged
                  → Interview.questions[] populated (server-generated _ids)
                  → questionGeneration.status: COMPLETED

User answers → Interview.answers[] appended, evaluationStatus: PENDING per answer

Submit → Interview.status: EVALUATING
       → per answer: AI Orchestrator (ANSWER_EVALUATION), reads
         Interview.questions[].expectedTopics + the answer text
       → AIExecution logged per answer
       → answers[i].evaluation populated, evaluationStatus: COMPLETED (or FAILED)
       → once all answers resolved (COMPLETED or FAILED):
            if any FAILED → Interview.status: EVALUATION_FAILED (partial —
              completed answers still have their evaluations, per Design 7 correction #9)
            else → Interview.report computed (server-side aggregation of
              per-answer evaluations) → Interview.status: COMPLETED
       → SkillProfileService.updateFromInterview() receives pre-normalized
         skill evidence events { skillKey, signal, answerIds } (produced by
         the interview→skill backend normalization layer per docs/08 §2 —
         SkillProfileService does not read raw topicAssessments itself, per
         docs/08's locked boundary: downstream layers never reinterpret
         upstream output), updates User.currentSkillProfile
       → ReadinessService computes readiness on next read (not stored)
```

This confirms the schema supports the full loop your friend's ChatGPT diagrammed, including the corrections: server-owned question IDs, per-answer evaluation status (so one failure doesn't nuke the whole interview), and a real source of truth for `skillCoverage`.

The `SkillProfileService` state-transition logic is defined by Design 8: Gemini quality labels map deterministically to 0/1/2/3; same-skill assessments are aggregated per interview; the first evidence always establishes `assessed: true` with `level: BEGINNER`; subsequent updates use the rolling five-interview average and the one-tier-per-cycle cap.

---

*This is the last major design checkpoint before implementation, per the agreed order. Once reviewed, next is: implementation architecture (folder structure finalized) → inspect the existing repo against this design → migration/rewrite plan → actual code.*
