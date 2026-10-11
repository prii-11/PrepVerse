# M7-P4 Interview Flow — Reconnaissance Report (read-only audit)

Milestone: M7-P4 (interview flow frontend integration). Status: RECON
COMPLETE, zero code changed. Backend reference: M2.1–M6 + M5.3 + M5.4 +
M5.5 CLOSED and immutable.

## 1. Frontend — current interview state (audited)

Every interview component is mock/static; no page calls the API.

| File | Status | Hardcoded data |
|---|---|---|
| `pages/interview/InterviewSetup.jsx` | Stub: static copy, dead "Start Interview"/"Save Draft" buttons | No state captured |
| `pages/interview/InterviewScreen.jsx` | Composition of static mock components | — |
| `pages/report/InterviewReport.jsx` | Dead `reportService`; hardcoded `OverallScore(84)` | score = 84 |
| `services/interviewService.js` | 3 methods, all `createMockResponse` | `interviewId: 'demo-interview'`, 3 hardcoded questions, `score: 78` |
| `hooks/useInterview.js` | Local UI state only (`currentQuestion`, `answers`) | Persists across nothing |
| `components/interview/QuestionCard.jsx` | Default `question = 'Tell me about yourself.'` | — |
| `components/interview/AnswerBox.jsx` | Static textarea, dead "Save Answer"/"Review Feedback" | — |
| `components/interview/Timer.jsx` | Default `15:00` | — |
| `components/interview/VoiceRecorder.jsx` | Placeholder "Audio capture is mocked" | — |
| `components/interview/InterviewProgress.jsx` | Default `current = 2, total = 5` | — |
| `components/report/{OverallScore,StrengthCard,WeaknessCard,FeedbackCard}.jsx` | Hardcoded fallback props | score 84, "Clarity/Confidence", "Pace control/Depth" |

No `questionCount` input. No real question display. Answers never persisted.
The prototype assumes immediate report after submit (no EVALUATING).

## 2. Backend contract (verified in `server/src`)

`server/src/modules/interviews/interview.routes.js` — all `requireAuth`,
ownership via `findOne({_id, userId})` → 404 mismatch:

| Method | Route | Validation | 200/201 response | Error envelope |
|---|---|---|---|---|
| POST | `/interviews` | `createInterviewBodySchema` (`targetRole`, `difficulty`, `questionCount?`) | 201 detail (see §6) | 400 `VALIDATION_ERROR`; 401; 409 not applicable (creation) |
| GET | `/interviews` | — | 200 `[{_id, targetRole, difficulty, status, createdAt, startedAt, completedAt}]` | 401 |
| GET | `/interviews/:id` | 24-hex `:id` | 200 detail (see §6) | 400 bad id; **404** not-yours |
| POST | `/interviews/:id/start` | 24-hex `:id` | 200 `{_id, status, startedAt}` | 400/404; **409** `INTERVIEW_ALREADY_STARTED` |
| POST | `/interviews/:id/answers` | 24-hex `:id`, `answerBodySchema` (`questionId` 24-hex, `text` non-empty) | 201 `{_id, questionId, text, evaluationStatus}` | 400 bad id/shape; **404** `Question not found`; **409** `INTERVIEW_NOT_IN_PROGRESS` |
| POST | `/interviews/:id/submit` | 24-hex `:id` | 200 detail (see §6) | 400/404; **409** `No answers to evaluate` / `INTERVIEW_NOT_IN_PROGRESS` |
| POST | `/interviews/:id/cancel` | 24-hex `:id` | 200 `{_id, status}` | 400/404; **409** `INTERVIEW_NOT_CANCELLABLE` |
| GET | `/interviews/:id/report` | 24-hex `:id` | 200 report object (see §6) | 400/404; **404** `Report not yet available` |

All 409s carry `{code}` in `details`. CAS-precondition failure (`not owned`
vs `wrong-state`) collapses to 404 vs 409 per service logic.

## 3. Interview lifecycle (derived from source)

```
                      create (AI: questions)
                 ┌─────►  CREATED ──► FAILED
                 │            │
                 │          start  (atomic: CREATED → IN_PROGRESS)
                 │            │
   user          │            ▼
   answers ──────┼────── IN_PROGRESS
                 │            │
                 │          submit  (CAS: IN_PROGRESS → SUBMITTED, must have ≥1 answer)
                 │            │
                 │          CAS: SUBMITTED → EVALUATING
                 │            │
                 │            ▼   per-answer (EVALUATING CAS):
                 │            ┌─► blank answer → scored 0, NO AI call
                 │            ├─► AI call (answerEvaluator via orchestrator)
                 │            └─► evaluation status → COMPLETED | FAILED
                 │            │
                 │            ├─ no answer FAILED  → EVALUATION_FAILED (CAS EVALUATING → EVALUATION_FAILED)
                 │            └─ all COMPLETED      → COMPLETED + report (CAS EVALUATING → COMPLETED)
                 │                                   (with profileSyncStatus PENDING)
                 │
                 └─ cancel (allowed from CREATED | IN_PROGRESS | EVALUATING | EVALUATION_FAILED)
                                        │
                                        ▼
                                  CANCELLED (terminal)
```

**EVALUATING =** the backend is running per-answer AI evaluation. The 201/submit
request resolves only when EVALUATING finishes → COMPLETED or EVALUATION_FAILED.
There is **no polling endpoint** for partial evaluation status. The frontend
waits for the synchronous `submit` request to resolve (can take seconds).
Cancel is allowed **during** EVALUATING but **not** from COMPLETED. The
prototype's "Submit → immediate report" assumption is **wrong**.

## 4. AI boundary (verified in source)

Frontend P4 must **never** import or call:

```
server/src/ai/orchestrator.js          (provider selection, retry/backoff, validation, logging)
server/src/ai/providers/gemini.js      (the ONLY provider)
server/src/ai/answerEvaluator.js       (→ orchestrator.run('ANSWER_EVALUATION'))
server/src/ai/questionGenerator.js     (→ orchestrator.run('QUESTION_GENERATION'))
server/src/ai/schemas/                 (validation schemas)
server/src/config/ai.js                (provider config chain)
```

The frontend consumes **one** thing: the `POST /interviews/:id/submit` response
(200 with the final detail + report). No frontend polling for answers; answers
are submitted via `POST /answers`, then `POST /submit` returns the final state.
The M5.3-11 test explicitly forbids `AnswerEvaluator`/`submit`/etc. in
`questionGenerator.js`; the same boundary applies to the frontend — **P4 does
not implement provider selection, failover, schema validation, or scoring.**

## 5. Report contract (verified in `interview.service.js` `buildReport` + model)

`GET /interviews/:id/report` (200) returns:

```jsonc
{
  "overallScore": 68,            // weighted: 0.50×corr + 0.30×depth + 0.20×comm, averaged
  "technicalScore": 66,          // 0.60×corr + 0.40×depth, averaged
  "communicationScore": 75,      // avg(communication)
  "strengths": ["Clear structure", "concise", "talks through trade-offs"], // capped 5, case-insensitive dedup, answer order
  "weaknesses": ["missing depth", "lacks examples"],
  "recommendations": ["Add a concrete example of a covering index."],
  "questionResults": [           // one per answer, COMPLETED answers only
    {
      "text": "<question text>",
      "technicalScore": 60,      // 0.60×corr + 0.40×depth (integer)
      "communicationScore": 90,
      "strengths": ["concise"],
      "weaknesses": ["lacks examples"],
      "recommendations": ["Add a concrete example of a covering index."]
    }
  ],
  "profileSyncStatus": "PENDING", // PENDING | COMPLETED | FAILED (M5.5 skill sync; never a top-level field)
  "generatedAt": "ISO date"
}
```

**Fields the prototype invents that do NOT exist:**
- `recommendations` per answer is **absent** in the real backend — only top-level `recommendations` exist. The prototype's `FeedbackCard` maps to top-level recommendations only.
- No per-answer `overallScore` anywhere — only `technicalScore` and `communicationScore`.
- No per-question `score` number.

The 404 `"Report not yet available"` (M4.3 §11) fires when `report.overallScore`
is null/undefined (no report yet — i.e., interview not COMPLETED). The frontend
must treat `GET /:id/report` on a COMPLETED-but-not-synced/early fetch as 404,
**not** 200-with-null.

## 6. GET /interviews/:id detail shape (the full contract)

`interview.controller.js` → `interview.service.js:getInterview` returns
`toObject()` minus `userId`:

```
{
  _id, targetRole, difficulty,
  status: CREATED|IN_PROGRESS|SUBMITTED|EVALUATING|COMPLETED|EVALUATION_FAILED|CANCELLED,
  questionGeneration: { status, promptVersion?, model?, failureReason? },
  questions: [{ _id, text, category, difficulty, expectedTopics: [{skillKey, topic}] }],
  answers: [{
    _id, questionId, text,
    evaluationStatus: PENDING|EVALUATING|COMPLETED|FAILED,
    evaluation: { correctness, technicalDepth, communication }  // only when COMPLETED
  }],
  report: { overallScore, technicalScore, ..., strengths, weaknesses, recommendations, questionResults, profileSyncStatus, generatedAt },  // only when COMPLETED
  startedAt?, completedAt?, createdAt, updatedAt
}
```

The `POST /submit` 200 response returns **the same shape** (service does a final
`findById` re-read after sync). So the frontend can drive the entire flow from
detail + report responses — `submit` returns both the latest detail AND the
report in one response.

## 7. Frontend state machine (P4 design — contract-derived)

```
SETUP
  ↓  (validate targetRole against catalog server-side)
POST /interviews  → 201 { _id, status: CREATED, questions, questionGeneration }
  ↓  (frontend: store _id + questions in component state, navigate to screen)
start interview
  ↓  POST /:id/start  → 200 { status: IN_PROGRESS }
  ↓  (CAS gate; 409 if already started → treat as "already in progress")
ACTIVE INTERVIEW
  ↓  render questions[0], AnswerBox
submit answer
  ↓  POST /:id/answers  → 201 { _id, questionId, text, evaluationStatus: PENDING }
  ↓  (frontend: append to answers[] in state, currentQuestion++)
[repeat until last question]
submit interview
  ↓  POST /:id/submit
  ↓  409 "No answers to evaluate" if zero answers
  ↓  200 detail (status: COMPLETED | EVALUATION_FAILED)
  ↓  (server does: CAS SUBMITTED, CAS EVALUATING, per-answer AI eval, CAS COMPLETED)
EVALUATING
  ↓  (frontend: the submit promise is pending for multiple seconds)
  └─ 200 COMPLETED → navigate to report, GET /:id/report (or use embedded)
  └─ 200 EVALUATION_FAILED → error screen "evaluation failed; try again"
CANCEL
  ↓  POST /:id/cancel → 200 { status: CANCELLED } (any time before COMPLETED)
```

**Terminal states:** COMPLETED, EVALUATION_FAILED, CANCELLED. From any terminal
state, only `GET /:id` and `GET /:id/report` are valid.

## 8. P4 file footprint (proposed, exact)

CREATE:
- `client/src/pages/resume/InterviewFlow.jsx` — state machine: setup → questions → submit → result/cancel
- `client/src/components/interview/QuestionView.jsx` — single question + answer + navigation
- `client/src/components/interview/InterviewHeader.jsx` — title + progress + cancel
- `client/src/services/interviewService.js` (rewrite: create, list, getInterview, startInterview, addAnswer, submitInterview, cancelInterview, getReport)
- `client/src/pages/resume/InterviewFlow.test.jsx`
- `client/src/components/interview/QuestionView.test.jsx`
- `client/src/services/interviewService.test.js`
- `client/src/pages/report/InterviewReport.test.jsx`

MODIFY:
- `client/src/hooks/useInterview.js` — real question navigation tied to backend questions array
- `client/src/routes/AppRoutes.jsx` — new `:id` param on interview screen + report route (or use state-based navigation)
- `client/src/pages/report/InterviewReport.jsx` — fetch report, render contract fields
- `client/src/components/report/OverallScore.jsx` — accept real `overallScore` number

DELETE:
- `client/src/components/interview/QuestionCard.jsx`
- `client/src/components/interview/AnswerBox.jsx`
- `client/src/components/interview/VoiceRecorder.jsx`
- `client/src/components/interview/InterviewProgress.jsx`
- `client/src/components/interview/Timer.jsx`

UNTOUCHED:
- `server/**` (all), `docs/18*`, `docs/19*`
- `client/src/services/{api,authService,userService,analyticsService,resumeService}.js`
- All P1/P2 files

## 9. Test strategy (Vitest/RTL — existing infra)

New test files (co-located):
- `client/src/utils/interviewFlow.test.js` — state machine unit tests (status transitions, e.g. SUBMITTED→EVALUATING→COMPLETED)
- `client/src/services/interviewService.test.js` — mock the api client; verify POST multipart, endpoints, headers
- `client/src/pages/resume/InterviewFlow.test.jsx` — setup→create, start, answer→answer submit, last answer→submit→COMPLETED, 409 handling, error states
- `client/src/pages/report/InterviewReport.test.jsx` — COMPLETED report render, no-score-for-missing-report, 404→retry, EVALUATION_FAILED
- `client/src/components/interview/QuestionView.test.jsx` — question text, answer input, validation (empty answer blocked or blank=0), progress label

Mock boundary: `vi.mock('../../services/interviewService', ...)` — never touch the real API.

## 10. Security / contract risks

| Risk | Current severity | Frontend mitigation |
|---|---|---|
| Stale state during EVALUATING (multi-second submit) | Medium | Loading spinner; submit button disabled; user stays on screen |
| Duplicate answer submission | Backend: answers are append-only; each questionId can be submitted multiple times | Track answered questionIds in frontend state; disable "next" until `POST /answers` 201 returns |
| Cancel during EVALUATING race | Backend: cancel CAS wins or loses atomically | Disable cancel during submit; if EVALUATION_FAILED appears after a late cancel, show cancelled message |
| Navigation during EVALUATING | Hard refresh mid-submit leaves an EVALUATING interview | `beforeunload` confirmation during submit; route guard stub (P5) |
| Report field mismatch (prototype shows invented scores) | High | Remove OverallScore(84) hardcoded → use real `overallScore`; omit per-answer overallScore |
| 401 during long EVALUATING | Medium | P1 interceptor clears state → redirect login (acceptable) |
| `targetRole` not in catalog | Backend 400 | Surface ValidationError `details.validOptions`; text input only (no client catalog lookup) |
| `profileSyncStatus: PENDING` post-COMPLETED | Medium | Display "skill profile updating" — do not block report |
| No per-answer `score` number | Data mismatch | Render only `technicalScore` + `communicationScore` per answer |

## 11. Boundary: M7-P4 vs M7-P5 vs M8/deferred

```
M7-P4  → Interview create/start/answers/submit/cancel + report rendering
M7-P5  → Frontend test maturity (coverage gate), accessibility, responsive polish
M8/deferred → Backend skill-profile sync display, resume-to-interview handoff,
              answer-by-answer live streaming (if ever added),
              provider-chain health UI (docs/16 failover stays backend-only)
```

## 12. Acceptance criteria (numbered)

1. `POST /interviews` valid role+difficulty+count → 201 questions + `questionGeneration.status: COMPLETED`
2. Invalid `targetRole` (not in catalog) → 400 ValidationError surfaced
3. `questionCount` defaults to 4; 3–5 enforced (client input max + server validation)
4. `POST /:id/start` from CREATED → 200 `{status: IN_PROGRESS, startedAt}`
5. Start on non-CREATED → 409 `INTERVIEW_ALREADY_STARTED` surfaced
6. `GET /:id` shows questions; each has `expectedTopics`
7. `POST /answers {questionId, text}` → 201 `{evaluationStatus: PENDING}`
8. Empty answer text → frontend blocks submission (UX guard; backend would score 0)
9. Submit before any answers → 409 `No answers to evaluate`
10. Submit with ≥1 answer → submit button disabled until answer posted (prevents duplicate submission)
11. Submit → loader (EVALUATING) → 200 COMPLETED report renders OR EVALUATION_FAILED error
12. Report: `overallScore`, `technicalScore`, `communicationScore`, `strengths`, `weaknesses`, `recommendations`, `questionResults` rendered
13. FAILED answer → excluded from aggregation (report fields reflect COMPLETED-only scoring)
14. Cancel from IN_PROGRESS → 200 CANCELLED; cancel from COMPLETED → 409
15. 401 during interview → auth interceptor clears state → redirect login
16. `GET /:id/report` before report exists → 404 → retry
17. Backend 176/176 passes unmutated; frontend build passes; no `server/src` changes
18. No AI/Gemini/Groq/Supabase/DI calls in frontend; no local extraction
19. No `DEMO_*` interview data remains in frontend after P4

## 13. Stop condition / open items

- **Navigation model**: route param (`/interview/:id`) vs component state — impacts `AppRoutes.jsx`. Recommendation: route-param for back-button/refresh recovery; `GET /:id` restores state.
- **No polling endpoint**: `submit` is synchronous backend — EVALUATING waits for the single request to resolve. No progress polling needed.

---

**STOP — awaiting approval.**

Do not implement. Do not change files. Do not commit. Do not begin P5.
