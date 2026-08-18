# M7 Frontend Integration — Reconnaissance Report (read-only audit)

Milestone: M7 (frontend integration) — audit phase. Status: RECON COMPLETE, zero
code changed. Backend reference state: M2.1–M6 CLOSED (176 tests green).

## 1. Scope and method

Read-only audit of `client/` against the backend API contract (`docs/02 §3`,
`docs/05`, `docs/06`, `docs/07`) and the M6 resume-storage pipeline
(`docs/17`). Goal: produce the inventory and contract matrix M7 implementation
needs, flag mismatches, and defer cross-cutting issues. No `client/` or
`server/` source files were modified.

## 2. Frontend inventory (as audited)

Framework: Vite 7 + React 19.1 + react-router-dom 7.7.1 (v6-style Routes API) +
Tailwind 4 + axios 1.11. No state/query library, no test setup, no i18n, no
form library.

```
client/
├── brain.md, LANDING_PAGE_GUIDE.md      # prototype scratch docs (not design)
├── index.html
├── vite.config.js
├── src/
│   ├── main.jsx                          # providers: AuthProvider > UserProvider > Router
│   ├── App.jsx                           # BrowserRouter + routes
│   ├── index.css                         # Tailwind
│   ├── api.js                            # axios client (baseURL env || api.example.com)
│   ├── routes/
│   │   ├── AppRoutes.jsx                 # ALL routes public (no guards wired)
│   │   └── ProtectedRoute.jsx            # exists, unused
│   ├── layouts/
│   │   ├── MainLayout.jsx                # Navbar + Sidebar + Outlet
│   │   └── AuthLayout.jsx                # centered card wrapper
│   ├── context/
│   │   ├── AuthContext.jsx               # demo auth, localStorage (auth_token/auth_user)
│   │   └── UserContext.jsx               # DEMO_USER + hardcoded readiness: 72
│   ├── hooks/
│   │   ├── useAuth.js                    # useContext(AuthContext)
│   │   └── useInterview.js               # local question/answer state only
│   ├── utils/
│   │   ├── constants.js                  # ROUTES, APP_NAME, DEMO_USER/DEMO_STEPS/DEMO_WEAK_AREAS
│   │   └── helpers.js                    # cn, formatPercent, createMockResponse
│   ├── services/                         # ALL MOCKS — none import api.js
│   │   ├── api.js                        # real axios client, unused by services
│   │   ├── authService.js                # login/signup/logout mock
│   │   ├── interviewService.js           # create/list/start/submit/report mock
│   │   ├── resumeService.js              # upload/analyze mock
│   │   ├── practiceService.js            # hardcoded 3-day plan mock
│   │   └── reportService.js              # hardcoded score/strengths/weaknesses mock
│   ├── pages/                            # all static/mock, no fetch calls
│   │   ├── auth/{Login,Signup}.jsx
│   │   ├── resume/{ResumeUpload,ResumeAnalysis}.jsx
│   │   ├── interview/{InterviewSetup,InterviewScreen}.jsx
│   │   ├── report/InterviewReport.jsx
│   │   ├── dashboard/Dashboard.jsx
│   │   ├── profile/StudentProfile.jsx
│   │   ├── practice/PracticePlan.jsx
│   │   ├── progress/Progress.jsx
│   │   ├── landing/LandingPage.jsx
│   │   └── NotFound.jsx
│   └── components/                       # presentational, all hardcoded default props
│       ├── common/ {Navbar,Sidebar,Button,Input,Modal,Loader,Footer}.jsx
│       ├── dashboard/ {ScoreCard,ReadinessCard,WeakAreaCard,ProgressGraph}.jsx
│       ├── interview/ {QuestionCard,AnswerBox,Timer,VoiceRecorder,InterviewProgress}.jsx
│       ├── report/ {OverallScore,StrengthCard,WeaknessCard,FeedbackCard}.jsx
│       ├── practice/ {DayCard,PracticeCard}.jsx
│       ├── resume/ {ResumeScore,ResumeSuggestion}.jsx
│       └── landing/ {Navbar,HeroSection,GlowBackground,Features,HowItWorks,Footer,CTA}.jsx
```

Summary: ~55 source files. Every component renders from default/hardcoded
props; every service resolves mock data via `createMockResponse`. Zero network
calls in `pages/` and `components/`.

## 3. Backend contract matrix (verified in `server/src` routes/controllers)

Auth — `GET|POST /api/v1/auth/register|login|logout`, `GET /api/v1/auth/me`.
JWT in memory only, short-lived; NO refresh/long-lived storage (docs/06).

| Client concern (file) | Backend endpoint | Contract (verified) | Status |
|---|---|---|---|
| Auth forms (Login/Signup) | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/me` | `{user, token}`; Bearer header | Backend complete; client mock |
| Profile (StudentProfile) | `GET/PATCH /users/me/profile` | `updateProfileSchema` | Backend complete; client mock |
| Skill profile (StudentProfile) | `GET /users/me/skill-profile` | `{skills[], ...}` from SkillProfileService (M5.5) | Backend complete; client mock |
| Dashboard readiness | `GET /analytics/readiness` | `{score, breakdown, interviewCount}` | Backend complete; client hardcoded |
| Progress trend (Progress) | `GET /analytics/progress` | chronological `{score, completedAt}` series | Backend complete; client mock |
| Practice plan (PracticePlan) | `GET /analytics/practice-plan` | `{targetRole, skillGaps}` | Backend complete; client hardcoded 3-day mock |
| Interview setup | `POST /interviews` | `{targetRole, difficulty, questionCount?}` (3–5, default 4) → 201 | Backend complete; client static form |
| Interview list | `GET /interviews` | `{interviews[]}` | Backend complete; client mock |
| Interview screen | `POST /interviews/:id/start` → `POST /interviews/:id/answers` (`{questionId,text}`) → `POST /interviews/:id/submit` | state machine CREATED→IN_PROGRESS→SUBMITTED→EVALUATING→COMPLETED; idempotent 409 on invalid transitions | Backend complete; client static |
| Report | `GET /interviews/:id/report` | `{report{topicAssessments[], overallScore, strengths, weaknesses, ...}, status}` | Backend complete; client hardcoded |
| Cancel | `POST /interviews/:id/cancel` | → CANCELLED | Backend complete; client none |
| Resume upload (ResumeUpload) | `POST /resumes` multipart field `file` | PDF/DOCX, ≤5MB; 201 `{status:'ANALYZED', analysis{...}}` or `{status:'FAILED', failureReason}` | Backend complete (M6); client placeholder |
| Resume analysis (ResumeAnalysis) | `GET /resumes/:id` (+ list) | full resume object w/ analysis | Backend complete; client mock |
| Resume download | `GET /resumes/:id/download` | `{url, filename, expiresInSeconds: 900}` signed URL | Backend complete (M6); client none |
| Resume delete | `DELETE /resumes/:id` | 204 | Backend complete (M6); client none |

Every endpoint enforces ownership via `findOne({_id, userId: req.user.id})` →
404 on mismatch (docs/06 §2), JWT `requireAuth`, and `validate()` middleware.

## 4. Findings (P2–P4; P1 = none)

- **P2 — Auth storage mismatch.** Client `AuthContext` persists `auth_token`
  in localStorage; backend contract is in-memory JWT only (docs/06 §5.4). The
  two must be reconciled during M7 wiring — client must hold the token in
  memory (module-level variable) and never persist it.
- **P2 — Services are pure mocks, `api.js` unused.** No service imports the
  real axios client; the request interceptor (Bearer header from
  localStorage) has never run. M7 wire-up replaces the six mock services with
  real calls — keep `createMockResponse` for a dev mock switch.
- **P3 — Default `baseURL: https://api.example.com`.** Harmless (mocks), but
  must be `VITE_API_BASE_URL` when wired. Documented in `docs/02` §3.
- **P3 — `ProtectedRoute` exists but is unused.** All routes public. `AuthLayout`
  lacks a redirect. Wire as part of M7.
- **P3 — Dead demo UI.** Google button `onClick={() => {}}` on Login,
  "Forgot password" dead links; landing footer links unresolved. Remove or
  wire in M7.
- **P3 — No frontend test setup.** M7 should add Vitest + React Testing
  Library; component contract tests via the mock switch.
- **P4 — `useInterview`/`hooks/` are scaffolding** (local state only) and will
  be largely replaced by service-backed state.
- **Cross-cutting (defer to M8):** per-user AI rate limiting (`aiRateLimit`)
  — gap documented in `docs/17` §10; no AI-model auth-key exposure in
  `client/` (verified: only the `api.example.com` fallback URL).

## 5. Recommended M7 sequencing (next checkpoint, not part of this audit)

1. Wire auth (`register/login/logout/me`) with in-memory token; activate
   `ProtectedRoute` + route guards; remove localStorage persistence.
2. Wire users (profile, skill-profile) and analytics (readiness, progress,
   practice-plan) for Dashboard/Profile/Progress/PracticePlan.
3. Wire resumes: upload form (multipart `file`, size/MIME guards), list,
   analysis view, download URL (15-min expiry), delete.
4. Wire interviews: setup (targetRole from catalog, difficulty, questionCount),
   start → answers loop → submit → report; poll/evaluate state for EVALUATING.
5. Add Vitest smoke/contract tests behind the mock switch; remove demo data
   and dead UI.

Design ambiguity noted during audit: none requiring STOP — all backend
contracts verified in source match `docs/02 §3`/`docs/05`/`docs/06`/`docs/07`.
`client/` docs (`brain.md`, `LANDING_PAGE_GUIDE.md`) are prototype scratch and
are not treated as design inputs.
