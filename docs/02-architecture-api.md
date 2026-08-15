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
│           CREATED/IN_PROGRESS → CANCELLED (user abandons)
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

Readiness score is **never stored** — it's computed on read by `ReadinessService.calculateReadiness(userId)` from `currentSkillProfile` + recent interview reports. PracticePlan is likewise computed on-demand, not persisted.

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
          │   Atlas    │ │(2.5 Flash)  │ │   Storage   │
          └────────────┘ └─────────────┘ └─────────────┘
```

### 2.1 Backend module layout (extends the structure your friend's ChatGPT sketched)

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
      └─ max retries exhausted → Interview → EVALUATION_FAILED
                                  Resume → FAILED
```

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
| POST | /api/v1/resumes | synchronous: upload → extraction + AI analysis → status: ANALYZED or FAILED (no PROCESSING state; see §2.3) |
| GET | /api/v1/resumes | list user's resumes |
| GET | /api/v1/resumes/:id | includes analysis once status: ANALYZED |
| DELETE | /api/v1/resumes/:id | |

### Interviews
| Method | Path | Notes |
|---|---|---|
| POST | /api/v1/interviews | { targetRole, difficulty } → status: CREATED, questions generated |
| GET | /api/v1/interviews | list, filterable by status |
| GET | /api/v1/interviews/:id | full interview incl. questions |
| POST | /api/v1/interviews/:id/start | status → IN_PROGRESS |
| POST | /api/v1/interviews/:id/answers | { questionId, text } → appended to answers[] |
| POST | /api/v1/interviews/:id/submit | status → SUBMITTED → EVALUATING → triggers AnswerEvaluator for all answers |
| GET | /api/v1/interviews/:id/report | available once status: COMPLETED |
| POST | /api/v1/interviews/:id/cancel | status → CANCELLED (only from CREATED/IN_PROGRESS) |

### Analytics
| Method | Path | Notes |
|---|---|---|
| GET | /api/v1/analytics/readiness | computed on read via ReadinessService — { score, breakdown } |
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
4. **AI provider:** Gemini 2.5 Flash behind the provider-agnostic AI Orchestrator.

---

*Next: Design 6 (Security) can mostly piggyback on what's already decided here (JWT, bcrypt, validation-before-auth ordering). Design 7 (AI prompt design + schemas) is probably the next substantive doc — that's where promptVersion strings and the actual Gemini prompts for each of the three AI operations get written.*
