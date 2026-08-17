# ROADMAP.md

Status: system design complete (`/docs/01` – `/docs/08`). Server milestones `M2.1`–`M4.5` and `M5.1`–`M5.5` are implemented and CLOSED; the next milestone is `M5.6` (readiness/skill coverage per `docs/07` §6). This document maps the original prototype against that design as the historical implementation plan; the milestone table below (§ Build order) is the live status index.

## Server — `server/`

> The verdicts below describe the original pre-milestone prototype and the work each file needed. **All of it has been executed** (M2.1–M5.3); rows marked *Build new* below now exist under `server/src/`. Kept as the historical mapping — the milestone table is the authoritative status index.

| Existing file | Verdict | Notes |
|---|---|---|
| `server.js` | **Refactor** | Correct instinct (CORS, JSON, fail-fast DB connect) but needs to mount versioned `/api/v1` routers per module instead of a flat `/api/auth`. Move into `src/app.js` + `src/server.js` split per `docs/02` §2.1. |
| `config/db.js` | **Reuse (as-is)** | Mongoose connection + fail-fast-on-error pattern is correct. Move to `src/config/db.js`. |
| `models/User.js` | **Refactor** | Field-level shape (`firstName`, `lastName`, `email`, `password`, `profileCompleted`) is a valid subset but needs `profile`, `currentSkillProfile` added per `docs/05` §2. Rename `password` → `passwordHash` for clarity. |
| `controllers/authController.js` | **Refactor** | Signup/login logic (bcrypt hash, JWT sign) is sound and reusable as a starting point — but the current JWT strategy needs to match the final stateless-short-lived-JWT decision (`docs/06` §1.1), and needs to move into `modules/auth/` with a proper `auth.service.js` split (controller stays thin per `AGENTS.md`). |
| `routes/authRoutes.js` | **Refactor** | Only 2 routes exist (`/signup`, `/login`). Needs `/logout`, `/me` added, and the whole thing versioned under `/api/v1/auth`. |
| `middleware/authMiddleware.js` | **Rewrite** | Currently an empty placeholder — this is real, unimplemented work, not a refactor. Needs JWT verification + `req.user` population, used by every protected route. |
| *(does not exist)* `modules/users/`, `modules/resumes/`, `modules/interviews/`, `modules/analytics/` | **Implemented** | All five modules exist now: `server/src/modules/{auth,users,resumes,interviews,analytics}/` (M2.1–M5.3). |
| *(does not exist)* `ai/` (orchestrator, providers, resumeAnalyzer, questionGenerator, answerEvaluator, schemas) | **Implemented** | `orchestrator.js`, `providers/gemini.js`, `resumeAnalyzer.js`, `questionGenerator.js`, `answerEvaluator.js`, `schemas/` all exist (M5.1–M5.4). |
| *(does not exist)* `RoleSkillCatalog` seed data | **Implemented** | `server/scripts/seedRoleSkillCatalog.js` (M2.3). |
| *(does not exist)* `middleware/rateLimit.js`, `middleware/upload.js`, `middleware/error.js` | **Implemented** | `server/src/middleware/{auth,error,rateLimit,validate,upload}.js` all exist (M2.1–M3). |

## Client — `client/`

| Existing area | Verdict | Notes |
|---|---|---|
| `pages/landing/LandingPage.jsx` + `components/landing/*` | **Reuse (as-is)** | Fully self-contained, no backend dependency, no data-shape assumptions to break. Ship it unchanged. |
| `layouts/AuthLayout.jsx`, `layouts/MainLayout.jsx` | **Reuse (as-is)**, revisit styling later | Structural layout, no API coupling. `client/brain.md` already flags a visual-theme mismatch (landing black/purple vs. app shell light-olive vs. interview dark) — cosmetic, deferred past MVP functionality work. |
| `routes/AppRoutes.jsx`, `routes/ProtectedRoute.jsx` | **Reuse, minor refactor** | Route structure matches the page set we still want. `ProtectedRoute` currently reads `AuthContext` — fine, just needs `AuthContext` itself refactored (below). |
| `context/AuthContext.jsx` | **Rewrite** | Currently treats `localStorage` as session source of truth and is never actually wired to a real login call. Needs a real rewrite around the finalized stateless-JWT flow — short-lived access token in memory/React state (not `localStorage`, per `docs/06` §1.1's XSS note), real `authService` calls. |
| `context/UserContext.jsx` | **Rewrite** | Currently seeded demo profile. Needs to become the real `currentSkillProfile` / profile data source, fed by `GET /api/v1/users/me/*`. |
| `pages/auth/Login.jsx`, `pages/auth/Signup.jsx` | **Rewrite (small)** | UI is fine; the hardcoded `auth.login({ token: 'demo-token', ... })` calls are exactly what needs to change to call the real `authService` → real `api.js` → real backend. This is genuinely a small, contained fix once auth is real. |
| `services/api.js` | **Reuse (as-is)** | The Axios client with bearer-token injection is correctly built — it's just never been called. Point `VITE_API_BASE_URL` at the real backend and start using it. |
| `services/{auth,interview,practice,report,resume}Service.js` | **Rewrite (all 6)** | Every one is `createMockResponse(...)` — dead code returning hardcoded data. Each needs to become a real call through `api.js` to the matching `/api/v1/...` endpoint from `docs/02` §3. This is mechanical once the backend exists, but every mock's return shape needs to be checked against the *actual* validated AI-contract output shape (`docs/07`), not assumed to already match. |
| `pages/dashboard/Dashboard.jsx` + `components/dashboard/*` (ScoreCard, ReadinessCard, WeakAreaCard, ProgressGraph) | **Rewrite (data wiring)** | Components/layout likely reusable; they currently render hardcoded numbers instead of calling `GET /api/v1/analytics/readiness` / `/progress`. Needs the Skill Inventory vs. Skill Coverage split from `docs/08` §5 added — this is new UI, not just rewiring. |
| `pages/resume/{ResumeUpload,ResumeAnalysis}.jsx` + `components/resume/*` | **Rewrite (data wiring)** | Needs real upload flow (Supabase Storage per `docs/06`), real `POST /api/v1/resumes`, and the analysis display needs the "claimed vs. assessed" distinction added, not just today's flat score. |
| `pages/interview/{InterviewSetup,InterviewScreen}.jsx` + `components/interview/*` | **Rewrite (data wiring)**, `VoiceRecorder.jsx` **stays a placeholder** | Question/answer/timer UI likely reusable structurally. Needs real `POST /api/v1/interviews`, per-question submission, and to handle the real interview state machine (`CREATED/IN_PROGRESS/SUBMITTED/EVALUATING/COMPLETED/EVALUATION_FAILED/CANCELLED`) instead of an implicit flow. Voice capture is explicitly out of MVP scope (`docs/01` §1.5) — leave the placeholder as-is, don't build it. |
| `pages/report/InterviewReport.jsx` + `components/report/*` | **Rewrite (data wiring)** | Needs `topicAssessments` display added (new UI, ties to `docs/07` §4) — this is the most product-differentiating screen and currently shows generic hardcoded strengths/weaknesses. |
| `pages/practice/PracticePlan.jsx` | **Rewrite (data wiring)** | Needs `GET /api/v1/analytics/practice-plan` (computed on-demand, not persisted per `docs/01` §2.5). |
| `pages/profile/StudentProfile.jsx` | **Rewrite** | Needs the `targetRole` dropdown (catalog-backed, not free text — `docs/05` §5 correction) instead of whatever free-text field exists today. |
| `utils/constants.js`, `utils/helpers.js` | **Reuse, extend** | `createMockResponse` helper in `helpers.js` gets deleted once services are real; everything else likely stays. |
| Google OAuth button, "Forgot password" link | **Leave as placeholders** | Both explicitly out of MVP scope (`docs/01` §1.5). Don't implement, don't remove — just don't let them block anything. |

## Infra / config (all new)
- `server/.env.example` + `client/.env.example`
- Supabase Storage bucket + credentials
- Gemini API key (AI Studio, free tier)
- MongoDB Atlas cluster (if not already provisioned) — must be a **replica set** to support the transactions required by `SkillProfileService` (`docs/08` §8)

## Build order — milestone plan (source of truth for OpenCode phases)

Each milestone follows: MASTER PROMPT → OpenCode implements → CHECK PROMPT (self-audit) → dual review (ChatGPT + Claude) → git commit → next milestone. OpenCode does not improvise architecture — ambiguity gets reported back, not resolved unilaterally (see AGENTS.md guardrails).

| Milestone | Scope | Status |
|---|---|---|
|  M2.1 | Backend infrastructure (folders, config, app/server split, error middleware, rate limiting) — **no auth/AI/storage logic** | CLOSED |
| M2.2 | Error handling + validation foundation | CLOSED |
| M2.3 | Database models + indexes (full Mongoose schemas per docs/05) | CLOSED |
| M3 | Auth: stateless short-lived JWT only — signup → login → middleware → /me → logout. **No RefreshToken collection, no refresh cookie, no rotation** (docs/06 §1.1, final) | CLOSED |
| M4 | Core domain APIs: onboarding, resume metadata, interviews, reports — real contracts, no AI yet | CLOSED (implemented as M4.1–M4.4) |
| M4.5 | Skill engine: RoleSkillCatalog seed + SkillProfileService, deterministic and unit-tested with zero Gemini dependency (docs/08) | CLOSED |
| M5 | AI: Gemini adapter, AI Orchestrator, Resume Analysis, Question Generation, Answer Evaluation + topicAssessments, AIExecution logging | M5.1–M5.5 CLOSED (adapter, orchestrator, resume analysis, question generation, answer evaluation + topicAssessments + submission, AIExecution, skill evolution: evidence normalization + transactional profile sync per docs/08). Next: M5.6 (readiness computation per docs/07 §6) |
| M5.6 | Readiness Service: skillCoverage, weighted readiness + breakdown (docs/07 §6, docs/08 §6) | NOT STARTED |
| M6 | Storage: Supabase Storage, resume upload/download, signed URLs | NOT STARTED |
| M7 | Frontend integration: replace every mock service with real API calls, page by page | NOT STARTED |
| M8 | Hardening: rate limits, validation, security review, concurrency, tests, deployment | NOT STARTED |

Each milestone's own master prompt carries its detailed Acceptance Criteria checklist — kept as separate files (e.g. `M2.1-master-prompt-v2.md`) rather than duplicated here, so this table stays a status index, not a second copy that can drift from the real prompt.

## What's explicitly NOT happening in MVP
Per `docs/01` §1.5: voice/audio, interview scheduling, Google OAuth, background job queue, multi-provider LLM routing, Redis/Kafka. Don't build these even if it seems easy while touching nearby code.
