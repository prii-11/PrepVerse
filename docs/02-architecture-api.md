# PrepVerse — Design Doc 2: System Architecture & API Contract

*Builds on Design Doc 1 (Product Requirements & Domain Model, approved with 6 modifications). This doc is derived from the domain model — not from the existing skeleton's routes.*

---

## 1. Revised Domain Model (incorporating all 6 approved changes)

```
User
├── identity (email, passwordHash, firstName, lastName, timestamps)
├── profile
│    ├── targetRole
│    └── experienceLevel
├── currentSkillProfile          ← facts only, no derived score
│    ├── skills[] { name, level, lastAssessed }
│    ├── skillGaps[]
│    └── updatedAt
├── resumes[]  ────────────────► Resume (referenced, own collection)
└── interviews[] ──────────────► Interview (referenced, own collection)

Resume
├── userId
├── storageKey, originalFilename, mimeType, size   ← object storage ref, not the file
├── status (UPLOADED | ANALYZED | FAILED)  ← no PROCESSING; MVP upload is synchronous
├── analysis (embedded, structured — no raw LLM dump)
│    ├── extractedSkills[], experienceSummary, projects[]
│    ├── strengths[], skillGaps[]
│    └── promptVersion, model                        ← provenance, not raw output
└── timestamps

Interview
├── userId
├── targetRole, difficulty
├── status: CREATED → IN_PROGRESS → SUBMITTED → EVALUATING → COMPLETED
│                                                    ↘ EVALUATION_FAILED (after max retries)
│           CREATED/IN_PROGRESS/SUBMITTED/EVALUATING/EVALUATION_FAILED → CANCELLED (recovery path; never from COMPLETED — see §3 submission contract)
├── questions[] { id, text, category, difficulty, expectedTopics[{ skillKey, topic }] }
├── answers[] { questionId, text, score, feedback }
├── report (embedded, populated on COMPLETED)
│    ├── overallScore, technicalScore, communicationScore
│    ├── strengths[], weaknesses[], recommendations[]
│    ├── promptVersion, model
└── startedAt, completedAt, timestamps

AIExecution  (internal log, not user-facing)
├── userId, operation (RESUME_ANALYSIS | QUESTION_GENERATION | ANSWER_EVALUATION)
├── provider, model, promptVersion
├── status, latencyMs, tokenUsage, errorCode
├── structuredOutput (sanitized — no PII beyond what's needed to debug)
└── createdAt
```

Readiness score is **never stored** — it's computed on read by `ReadinessService.getReadiness(userId)` from `currentSkillProfile` + recent interview reports. PracticePlan is likewise computed on-demand, not persisted.

---

## 2. System Architecture

```
                    ┌──────────────────────┐
                    │      React SPA        │
                    │ Tailwind + Framer     │
                    └──────────┬────────────┘
                               │ HTTPS / REST (/api/v1)
                               ▼
                 ┌─────────────────────────────┐
                 │        Express API          │
                 │                              │
                 │  Auth · Users · Resumes ·    │
                 │  Interviews · Analytics      │  ← modules (routes → controller
                 │       (modules/)             │     → service → model)
                 │                              │
                 │  ┌────────────────────────┐  │
                 │  │  ReadinessService       │  │  deterministic, no LLM
                 │  └────────────────────────┘  │
                 │                              │
                 │  ┌────────────────────────┐  │
                 │  │   AI Orchestrator       │  │
                 │  │ ├─ ResumeAnalyzer       │  │
                 │  │ ├─ QuestionGenerator    │  │
                 │  │ └─ AnswerEvaluator      │  │
                 │  └──────────┬─────────────┘  │
                 └─────────────┼────────────────┘
                                │
                 ┌──────────────┼───────────────┐
                 ▼              ▼               ▼
          ┌────────────┐ ┌─────────────┐ ┌─────────────┐
          │  MongoDB   │ │  Gemini API │ │   Object    │
          │   Atlas    │ │(3.6 Flash)  │ │   Storage   │
          └────────────┘ └─────────────┘ └─────────────┘
```

### 2.1 Backend module layout

```
server/
├── src/
│   ├── config/         (db.js, env.js, ai.js, storage.js)
│   ├── modules/
│   │   ├── auth/        (controller, service, routes, validation)
│   │   ├── users/        includes profile + currentSkillProfile
│   │   ├── resumes/
│   │   ├── interviews/
│   │   └── analytics/    readiness score, progress trends
│   ├── ai/
│   │   ├── orchestrator.js
│   │   ├── providers/gemini.js       (implements a common Provider interface)
│   │   ├── resumeAnalyzer.js
│   │   ├── questionGenerator.js
│   │   ├── answerEvaluator.js
│   │   └── schemas/       (structured-output validation, one per operation)
│   ├── storage/
│   │   ├── storage.client.js         (Supabase Storage REST via fetch — M6; the ONLY module that speaks to object storage)
│   │   └── textExtractor.js          (PDF/DOCX → plain text — M6 P2; owns pdf-parse/mammoth, the only file-parsing deps)
│   ├── middleware/       (auth, error, rateLimit, upload)
│   ├── utils/
│   ├── app.js
│   └── server.js
```

Every AI module (`resumeAnalyzer`, `questionGenerator`, `answerEvaluator`) calls `orchestrator.run(operation, payload)`, not the Gemini provider directly. The orchestrator picks the provider, applies retry/backoff, validates the response against the operation's schema, and logs an `AIExecution` record. Swapping Gemini for Claude/OpenAI later means writing one new file in `ai/providers/` — nothing in `modules/` changes.

### 2.2 Request flow (layering, unchanged from your friend's original sketch — confirmed correct)

```
Request → IP Rate Limit → Authentication → Authorization → Per-user AI Rate Limit (AI routes only) → Validation → Controller → Service → Model → MongoDB
```

### 2.3 Processing model (MVP-synchronous; future async explicitly deferred)

Resume upload is synchronous in MVP: `POST /api/v1/resumes` does not return until extraction + AI analysis finishes and the resource is `ANALYZED` or `FAILED`. `PROCESSING` is a future state only and must not be faked in the MVP.

Interview answer evaluation is also performed synchronously within the submit workflow for MVP, while the `EVALUATING` status makes the lifecycle explicit. A real queue/background worker may be introduced later if measured latency justifies it; that is a future architecture change, not an MVP dependency.

### 2.4 AI failure handling

```
AI Orchestrator call
      │
      ├─ success → validate against schema → store → return
      │
      ├─ 429 (rate limit) → exponential backoff (1s, 2s, 4s) → retry (max 3)
      │
      ├─ malformed/schema-invalid response → retry once with stricter prompt
      │                                        → if still invalid: log AIExecution
      │                                          with errorCode, surface a
      │                                          user-facing "try again" error
      │
      ├─ availability failure with fallback configured (M5.7, docs/16):
      │   exhausted 429 backoff / quota / 5xx / timeout → next candidate in
      │   the configured chain, bounded by AI_MAX_TOTAL_ATTEMPTS, each attempt
      │   audited with attempt/fallbackFrom/fallbackReason (docs/05 §6)
      │
      └─ max retries exhausted → Interview → EVALUATION_FAILED
                                  Resume → FAILED
```

**M5.7 amendment:** the module layout is unchanged (`ai/` gains the provider layer `providers/{registry,classify,health,gemini,groq}.js` — see docs/16 §0/§2); only the orchestrator, config/ai, and the AIExecution schema change, all backward-compatible. Client-visible behavior is unchanged for the default single-provider deployment (docs/16 §12 rollback path).

---

## 3. API Contract (v1)

Layering per request (see §2.2 for the full, authoritative pipeline): `IP Rate Limit → Auth (JWT) → Authorization → [Per-user AI Rate Limit, AI routes only] → Validation → Controller → Service → Model`. All protected routes require `Authorization: Bearer <token>`, enforced by `authMiddleware`.

### Auth
| Method | Path | Notes |
|---|---|---|
| POST | /api/v1/auth/register | firstName, lastName, email, password. Returns { token, user } — same shape as login. Registration auto-authenticates (per docs/01's Sign up → Onboarding flow, which assumes no separate login step is required immediately after account creation). |
| POST | /api/v1/auth/login | returns { token, user } |
| POST | /api/v1/auth/logout | invalidate client-side token (stateless JWT — no server blacklist for MVP) |
| GET | /api/v1/auth/me | current user (protected) |

### Users / Profile
| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/users/me/profile | targetRole, experienceLevel |
| PATCH | /api/v1/users/me/profile | update onboarding fields |
| GET | /api/v1/users/me/skill-profile | currentSkillProfile (facts only) |

### Resumes
| Method | Path | Notes |
|---|---|---|
| POST | /api/v1/resumes | synchronous: upload → extraction + AI analysis → status: ANALYZED or FAILED (no PROCESSING state; see §2.3). Multipart 'file' field; validation (MIME allowlist PDF/DOCX, ≤5MB, magic-byte sniff, filename sanitization) happens in middleware before any storage/AI call (docs/06 §3). 201 on both terminal states; FAILED carries `failureReason` = errorCode |
| GET | /api/v1/resumes | list user's resumes (lightweight: no analysis, no storageKey) |
| GET | /api/v1/resumes/:id | includes analysis once status: ANALYZED |
| GET | /api/v1/resumes/:id/download | signed short-lived URL (15 min TTL, docs/06 §3.3) → `{ url, filename, expiresInSeconds }`; never a public link, never a stream |
| DELETE | /api/v1/resumes/:id | 204; removes the Mongo doc AND the stored object (best-effort object cleanup) |

### Interviews
| Method | Path | Notes |
|---|---|---|
| POST | /api/v1/interviews | { targetRole, difficulty, questionCount? } → status: CREATED, questions generated (questionCount optional, default 4, range 3–5 per docs/07 §3) |
| GET | /api/v1/interviews | list, filterable by status |
| GET | /api/v1/interviews/:id | full interview incl. questions |
| POST | /api/v1/interviews/:id/start | status → IN_PROGRESS |

**`POST /api/v1/interviews` failure/idempotency/transaction contract (resolved during the M5.3 audit — previously three genuine, cited gaps: no `failureReason` field, no idempotency rule, no transaction/atomicity decision):**

- **Idempotency:** none required. `POST /interviews` is an ordinary creation endpoint, not a state-transition endpoint — `AGENTS.md`'s idempotency rule (§7, `findOneAndUpdate` with a status precondition) applies specifically to transitions like `start`/`cancel`/`submit`, not to resource creation. Two identical `POST` calls create two separate `Interview` documents, which is correct REST semantics (`POST` is not required to be idempotent) and causes no actual harm — there's no natural dedup key, and building one (idempotency-key header, `userId`+`targetRole`+`difficulty` deduplication) would be unjustified complexity for a case with no real cost.
- **Transaction:** none. The Gemini call is an external HTTP request and structurally cannot be inside a MongoDB transaction (unlike `SkillProfileService`'s all-database-writes case in `docs/08` §8, which is why that one *does* use a transaction). The sequence is: create `Interview` (`status: CREATED`, `questionGeneration.status: PENDING`) → call `orchestrator.run('QUESTION_GENERATION', ...)` → on success, persist `questions[]` and set `questionGeneration.status: COMPLETED` **in a single atomic `findOneAndUpdate` call**, not two separate writes — this closes the narrowest crash window (a crash between "questions persisted" and "status set to COMPLETED" becomes structurally impossible, since it's one write). On failure (AI or schema), a second `findOneAndUpdate` sets `questionGeneration.status: FAILED` + `failureReason`.
- **Crash/failure recovery — `FAILED` is terminal for MVP, no auto-retry, no dedicated regenerate endpoint.** If generation fails (AI failure, exhausted schema retries) or the process crashes between interview creation and the AI call completing (leaving `questionGeneration.status: PENDING` indefinitely), the user's recovery path is the **existing** `POST /interviews/:id/cancel` endpoint (M4.3) — cancellation is valid from `CREATED` regardless of `questionGeneration.status`, since the two state trees are independent by design (§ elsewhere in this doc) — followed by creating a fresh interview. No new endpoint is introduced for this. This is a deliberate, documented MVP limitation, not an oversight — same category of trade-off as the stateless-JWT-no-revocation decision in `docs/06`: acceptable risk for a portfolio-scale project, revisit only if real usage shows it's a genuine problem.
| POST | /api/v1/interviews/:id/answers | { questionId, text } → appended to answers[]; `text` is trimmed, and blank/whitespace-only text is accepted as `""` (blank evaluation follows docs/07 §4 and docs/08 §2) |
| POST | /api/v1/interviews/:id/submit | status → SUBMITTED → EVALUATING → triggers AnswerEvaluator for all answers |
| GET | /api/v1/interviews/:id/report | available once status: COMPLETED |
| POST | /api/v1/interviews/:id/cancel | status → CANCELLED (from CREATED/IN_PROGRESS/SUBMITTED/EVALUATING/EVALUATION_FAILED — never from COMPLETED; CANCELLED is terminal; safe against concurrent evaluation via per-write status preconditions — see submission contract below) |

**`POST /api/v1/interviews/:id/submit` failure/concurrency/cancellation contract (resolved during the M5.4 gap-resolution audit — the concurrent-cancel vs live-evaluation race is the core resolution, not just the cancel allow-list):**

- **Submission lifecycle (two CAS gates):** `IN_PROGRESS →(CAS)→ SUBMITTED →(CAS)→ EVALUATING →(CAS)→ COMPLETED` or `EVALUATION_FAILED`. The first CAS — `findOneAndUpdate({ _id: interviewId, userId, status: 'IN_PROGRESS' })` — is the submission's own atomic idempotency gate (docs/05 §4 concurrency note): **only `IN_PROGRESS` may submit**, so a duplicate submission while the first is running, a retry after a network timeout on a submission that succeeded, and any submission after `EVALUATION_FAILED`/`COMPLETED`/`CANCELLED` all fail the gate and return `409 INTERVIEW_NOT_IN_PROGRESS` (existing conflict semantics; no new error code). The second CAS (`SUBMITTED → EVALUATING`) executes in the same request, immediately before the first per-answer evaluation call.
- **`SUBMITTED` semantics (intentional; the two states are deliberately kept distinct):** `SUBMITTED` = submission accepted, evaluation has not yet begun; `EVALUATING` = evaluation may have a live writer. `SUBMITTED` is transient during the normal synchronous submission, a durable crash-window marker if the process dies between the two CAS writes, observable through `GET /:id` whenever it is persisted, and cancellable for recovery. A crash between the two writes is an accepted consequence of the no-transaction synchronous MVP design — recoverable via cancel + recreate.
- **Cancellation allow-list + `CANCELLED` terminality (recovery-path extension of the M5.3 creation contract above):** cancellation is valid from `CREATED`, `IN_PROGRESS`, `SUBMITTED`, `EVALUATING`, and `EVALUATION_FAILED` — never from `COMPLETED` (terminal and immutable with respect to `Interview.status`). **`CANCELLED` is terminal: no transition leads out of it** — no un-cancel, no return to `CREATED`/`IN_PROGRESS`/`SUBMITTED`/`EVALUATING`, no path to `COMPLETED` — uniformly, regardless of which state it was cancelled from. Evaluation failure is itself terminal once the orchestrator retry policy is exhausted: no automatic retry beyond it, no dedicated retry/re-evaluation endpoint, no per-answer retry endpoint. `EVALUATION_FAILED` retains the completed per-answer evaluations (docs/05 §7, Design 7 correction #9) and computes no report; recovery for `EVALUATION_FAILED` and for crash-stuck `SUBMITTED`/`EVALUATING` is the existing cancel + recreate path. This extends the already-accepted M5.3 recovery philosophy — not a new recovery architecture.
- **Concurrency invariant — every evaluation write is CAS'd on `EVALUATING` (hard M5.4 contract):** each evaluation persistence/state write filters on the expected current state — per-answer evaluation persistence, the final success write (`report` + `completedAt` + `status: COMPLETED` in ONE atomic update), and the final failure write (`status: EVALUATION_FAILED`) all use `findOneAndUpdate({ _id, status: 'EVALUATING' }, ...)`. No load-then-save (`findOne` + mutate + `save()`) and no unconditional `findOneAndUpdate({ _id }, ...)` for evaluation state — a concurrent cancellation can never be silently overwritten by an in-flight evaluator.
- **Cancel wins the race:** if cancel's CAS (`EVALUATING → CANCELLED`) lands first, every subsequent evaluation write fails its precondition (matches zero documents); the evaluator stops further evaluation work at the first failed write — no further Gemini calls, no further persistence; a cancelled interview can never be resurrected to `COMPLETED`/`EVALUATION_FAILED`, and no evaluation result is persisted after cancellation. Gemini calls already in flight may finish, but their results must never be persisted after cancellation. The losing submission returns `409 INTERVIEW_NOT_IN_PROGRESS`.
- **Evaluation wins the race:** if the final CAS (`EVALUATING → COMPLETED`, report included atomically) lands first, a concurrent cancel fails its state precondition and returns the existing `409 INTERVIEW_NOT_CANCELLABLE`; `COMPLETED` is never changed to `CANCELLED`.
- **Live vs stuck evaluation:** the MVP introduces no heartbeat/lease/worker-registry/queue/timeout-marker infrastructure to distinguish a live evaluator from a dead one — they are indistinguishable by design, and the CAS invariant makes cancellation safe in both cases: no write can land after `CANCELLED` is authoritative.
- **Transaction/atomicity:** no Mongo transaction (external Gemini calls cannot be inside one — same rationale as the creation contract above); atomic writes + CAS preconditions only. Atomic write, CAS precondition, and Mongo transaction are distinct mechanisms; M5.4 uses the first two.
- **Successful submission response:** `200` + the updated Interview detail shape already established by the interview API (the same shape as `GET /:id`), which includes the completed `report` on successful evaluation. No new response envelope.
- **Post-sync response state (M5.5 resolution):** profile synchronization is synchronous and runs after the COMPLETED CAS (docs/05 §7, docs/08 §9). `POST /:id/submit` re-reads the interview after synchronization and returns the fresh document, so the response reflects the actual persisted post-sync state: `report.profileSyncStatus` is `COMPLETED` when synchronization succeeded and `FAILED` when it did not — never the stale pre-sync `PENDING` snapshot. A sync failure is not a submission failure (docs/08 §9a): the interview stays `COMPLETED` with its report intact, the profile update is rolled back, and the response carries `report.profileSyncStatus: FAILED`. `GET /:id` mirrors the same document, so the FAILED state is observable through the existing detail endpoint.
- **Sync markers (M5.5, docs/08 §9a):** `Interview.report.skillSync` records in-flight sync state; the SkillProfileService `getSyncStatus()` read answers `BUSY`/`EXPIRED` while a marker is unfinished and otherwise reports the persisted `profileSyncStatus`. These are service-level reads only — no new endpoint is introduced.
- **Zero-answer submission:** an interview with zero answers must NOT become a `COMPLETED` interview with null report scores (report/readiness consumers discriminate on `report.overallScore` being a number) — submission is rejected with `409` (existing `ConflictError` model; "no answers to evaluate"). No new error code.
- **Report aggregation (deterministic backend aggregation, no LLM call — docs/05 §4 note):** `report.strengths`/`report.weaknesses` aggregate the COMPLETED answers' `evaluation.strengths`/`evaluation.weaknesses`, preserving answer order then per-answer order, case-insensitive deduplication with first occurrence winning, maximum 5, no frequency threshold. `report.recommendations` aggregates the COMPLETED answers' `evaluation.improvementTip` under the same rules — resolved: not derived from weaknesses, and no per-answer recommendations field is introduced.
- **Per-user AI rate limiting:** remains deferred — the existing no-op middleware is not mounted, `rateLimit.js` is not modified; provider 429 retry (orchestrator backoff) and application-level per-user rate limiting remain separate concerns (docs/06 §0.1).
- **M5.5 scope boundary:** submission/evaluation persists `answers[].evaluation.topicAssessments` (docs/05 §4) and then synchronizes normalized evidence into `User.currentSkillProfile` (docs/05 §7, docs/08 §9/§9a). Explicitly deferred and out of scope for M5.5 (docs/08 §10): readiness/practice-plan computation, skill decay, recency weighting, cross-interview question deduplication, and any re-processing/retry endpoint for FAILED syncs (FAILED is terminal for MVP).
- **Required M5.4 concurrency proof (the gap-resolution audit confirmed NO existing concurrent race test in the suite):** the test suite MUST include real concurrent tests proving both directions after both operations settle, inspecting the persisted document: (A) cancel wins — final `status === 'CANCELLED'`, no evaluation state written after cancellation, no `CANCELLED → COMPLETED`/`EVALUATION_FAILED` resurrection, losing evaluation reports the expected conflict; (B) evaluation wins — final `status === 'COMPLETED'` with intact report, cancel reports the expected conflict, `COMPLETED` never becomes `CANCELLED`. The CAS pattern is not "test-proven" until these tests exist and pass.

### Analytics
| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/analytics/readiness | computed on read via `ReadinessService.getReadiness(userId)` (docs/07 §6) — `{ score, breakdown, interviewCount }`: `score` 0–100 or null (null when readiness cannot be computed — see docs/07 §6 cold start); `breakdown` = `{ technical, communication, skillCoverage, consistency, improvementTrend }`, each 0–100 or null, neutral-prior components reported as 50; `interviewCount` = number of `COMPLETED` interviews included. **Inclusion gate:** every `Interview.status === COMPLETED` interview contributes regardless of `report.profileSyncStatus`, including `FAILED` (docs/07 §6). |
| GET | /api/v1/analytics/progress | score trend across completed interviews, ordered chronologically by `completedAt` (resolved — previously unspecified; `completedAt` chosen over `createdAt`/`report.generatedAt` since it's the field that semantically means "when this interview finished," already a real top-level field as of M4.3) |
| GET | /api/v1/analytics/practice-plan | computed on-demand from currentSkillProfile |

### Error shape (consistent across all endpoints)
```json
{
  "error": {
    "code": "RESUME_ANALYSIS_FAILED",
    "message": "human-readable message",
    "details": { }
  }
}
```

---

## 4. Finalized architecture decisions

1. **Object storage provider:** Supabase Storage. It is the MVP object-storage layer for private resume files and signed/short-lived access URLs.
2. **ReadinessService formula:** finalized in Design 7 §6:
   `0.35 × technical + 0.20 × communication + 0.25 × skillCoverage + 0.10 × consistency + 0.10 × improvementTrend`, with the documented cold-start handling.
3. **JWT logout semantics:** stateless short-lived JWT. Logout discards the client-held access token. There is no refresh-token collection, refresh cookie, rotation, or server-side blacklist in MVP.
4. **AI provider:** Gemini 3.6 Flash behind the provider-agnostic AI Orchestrator.

---

*Next: Design 6 (Security) can mostly piggyback on what's already decided here (JWT, bcrypt, validation-before-auth ordering). Design 7 (AI prompt design + schemas) is probably the next substantive doc — that's where promptVersion strings and the actual Gemini prompts for each of the three AI operations get written.*
