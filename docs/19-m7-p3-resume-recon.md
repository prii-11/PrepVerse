# M7-P3 Resume Integration — Reconnaissance Report (read-only audit)

Milestone: M7-P3 (resume pipeline frontend integration). Status: RECON
COMPLETE, zero code changed. Backend reference: M2.1–M6 CLOSED and immutable
(M5.7 failover, M6 storage/upload/extraction). This document is the audit
artifact the P3 implementation will build against.

## 1. Current frontend resume state (audited)

- `client/src/pages/resume/ResumeUpload.jsx` — renders `ResumeUploader` only;
  no file input, no API call.
- `client/src/components/resume/ResumeUploader.jsx` — **placeholder**: dashed
  card, static "Choose File" button with no `onClick`, copy says "Accepts PDF
  and DOCX in the future".
- `client/src/pages/resume/ResumeAnalysis.jsx` — renders `ResumeScore` +
  `ResumeSuggestion` with **hardcoded values** (`score: 86`,
  suggestions array). There is no list of resumes, no detail fetch.
- `client/src/components/resume/ResumeScore.jsx` — hardcoded `score = 86`
  fallback prop.
- `client/src/components/resume/ResumeSuggestion.jsx` — presentational list,
  defaults to empty; reusable as-is.
- `client/src/services/resumeService.js` — **pure mock**:
  `uploadResume` / `analyzeResume` return `createMockResponse`; no real
  endpoint calls; does not import `api.js`.
- Routing: `ROUTES.resumeUpload = /resume/upload`, `ROUTES.resumeAnalysis =
  /resume/analysis` — both already inside `ProtectedRoute` (P1), so
  authentication-gating is already in place.
- No resume list/detail/download/delete UI exists anywhere in `client/`.

## 2. Backend API contract (verified in `server/src`, not docs)

| Endpoint | Auth | Validation | Success | Failure |
|---|---|---|---|---|
| `POST /resumes` | `requireAuth` | `uploadFile` middleware: multipart field **`file`**, memory storage, 1 file | **201** full detail, `status: ANALYZED` (analysis populated) **or** `FAILED` (failureReason set) | 400 `VALIDATION_ERROR` (see codes below); 401; sync — never PROCESSING in the response |
| `GET /resumes` | `requireAuth` | — | 200 summary array `[{_id, status, originalFilename, createdAt}]` sorted `createdAt desc` | 401 |
| `GET /resumes/:id` | `requireAuth` | `id` = 24-hex ObjectId (`idParamSchema`) | 200 full detail (see shape) | 400 bad id; **404** on not-found/not-yours (same response, docs/06 §2) |
| `GET /resumes/:id/download` | `requireAuth` | 24-hex id | 200 `{ url, filename, expiresInSeconds: 900 }` (15 min, verified `config/storage.js:37` and `M6-P3-1` test) | 400/404 as above; missing object → 404 `'Resume file not found'` |
| `DELETE /resumes/:id` | `requireAuth` | 24-hex id | **204** empty body (doc + best-effort object cleanup; 204 regardless of cleanup) | 400/404 |

Upload error detail codes (test-verified `M6-P2-5b`): `FILE_TOO_LARGE` with
`details.maxBytes`; unsupported MIME; content/declared-type mismatch; wrong
extension. All 400 `{ error: { code: VALIDATION_ERROR, message, details } }`.

Status values: `UPLOADED` (transient server-side only), `ANALYZED`, `FAILED`.
`failureReason` codes (model contract + tests): `RESUME_TEXT_EXTRACTION_FAILED`,
`AI_PROVIDER_FAILED`, `SCHEMA_VALIDATION_FAILED`.

Detail shape: `{ _id, storageKey, originalFilename, mimeType, size, status,
analysis|null, failureReason|null, createdAt, updatedAt }`.

Analysis shape: `{ extractedSkills[], experienceSummary, projects[{name,
description, technologies[]}], strengths[], skillGaps[], promptVersion, model }`
— **there is no numeric score in the analysis. The prototype's "Resume Score
86" is an invented metric and must be removed, not adapted.**

## 3. Exact files that would be created (P3 implementation)

- `client/src/components/resume/ResumeList.jsx` — summary list from
  `GET /resumes` (empty state, loading, error+retry).
- `client/src/components/resume/ResumeDetail.jsx` — detail/analysis renderer
  for ANALYZED (skills/summary/projects/strengths/gaps) and FAILED
  (failureReason label); defensive UPLOADED state (server crash window only).
- `client/src/utils/fileValidation.js` — pure client-side pre-check helper:
  PDF/DOCX (extension + MIME) and ≤5MB. UX pre-check only — the server
  remains authoritative (it re-validates MIME/magic-bytes/extension).

## 4. Exact files that would be modified

- `client/src/services/resumeService.js` — replace mocks with real methods:
  `createResume(file)` (multipart `FormData`, field `file` — axios handles the
  boundary; JSON header must not override), `listResumes()`, `getResume(id)`,
  `getDownloadUrl(id)`, `deleteResume(id)`. Only HTTP callers in the app.
- `client/src/pages/resume/ResumeUpload.jsx` — real upload flow with states.
- `client/src/pages/resume/ResumeAnalysis.jsx` — real list + select + detail.
- `client/src/components/resume/ResumeUploader.jsx` — real file input
  (`accept=".pdf,.docx"`), client pre-check, upload, result states, download
  + delete actions for the uploaded resume.

## 5. Exact mock/dead files that would be removed

- `client/src/components/resume/ResumeScore.jsx` — **delete**: built on the
  non-existent score metric.
- `resumeService.js` mock bodies — replaced in place (file kept).
- No other files lose usage; `createMockResponse` stays for P4 services.

## 6. UI flow

```
ResumeUpload:  [Choose PDF/DOCX] → client pre-check
               → upload (FormData POST /resumes) → 201
                 ├─ ANALYZED → summary (skills, strengths, gaps) +
                 │            Download {url,filename} + Delete
                 └─ FAILED   → failureReason label + "Delete and retry"
ResumeAnalysis: list (GET /resumes) → select row
               → detail (GET /resumes/:id) → analysis render
               → download (GET /:id/download fresh each time, 15-min URL)
               → delete (DELETE /:id → 204 → refetch list)
```

## 7. API/data-flow mapping

Pages → `resumeService` → shared axios client (Bearer token, P1) →
backend. No page ever calls HTTP directly; no second client; no provider
SDKs. Multipart: `FormData` + `{ headers: { 'Content-Type': 'multipart/form-data' } }`
(via axios config on that single call; the shared interceptor still adds the
auth header).

## 8. Loading / error / empty / state rendering

- **Loading**: sync upload request *is* the loading state (seconds: storage +
  extraction + AI). Single spinner; no polling — the contract never returns
  PROCESSING. List/detail have their own Loaders.
- **Error**: 400 envelope message surfaced (e.g. "File too large — maximum
  5MB"); 401 auto-clears auth (P1 interceptor) → route guard redirects;
  network failure → helper fallback message; Retry buttons refresh lists.
- **Empty**: list empty → "No resumes yet — upload one"; detail absent →
  prompt to select.
- **FAILED**: show `failureReason` mapped to human text; still downloadable
  only if... (no — FAILED rows keep the object store entry but have no
  analysis; download remains available by contract).
- **ANALYZED**: render all analysis fields; download + delete enabled.

## 9. Security / ownership considerations

- Client pre-check is UX only — never trust client claims; server
  re-validates (magic bytes, MIME, extension, 5MB). No backend duplication
  on the client side beyond pre-check.
- No Supabase/Gemini/Groq/Azure access from the client; no env secrets; the
  only new key consumed is `VITE_API_BASE_URL` (existing).
- Signed URLs are server-issued, 15-min scoped, fetched fresh per download —
  never cached/stored client-side.
- Ownership: the backend enforces `findOne({_id, userId})` → 404; the client
  simply renders 404s as "not found".
- `storageKey` is part of the detail shape by contract; render-nothing is
  acceptable — it is an opaque path, not a credential, and P3 takes no action
  (no leaking into UI copy either).

## 10. Test strategy (P5 foundation, not P3 scope)

- Vitest + RTL; `resumeService` replaced by a deterministic mock adapter at
  the boundary (no live AI/storage/Gemini/Supabase).
- Unit: `fileValidation` — PDF/DOCX accept, 5MB boundary (6MB reject, 5MB
  accept), type rejection.
- Component: upload success → ANALYZED; upload FAILED → failureReason;
  400 message rendering; loading; empty list; delete → refetch; download →
  URL anchor invoked; 401 → auth cleared.

## 11. Risks and ambiguities

- **Score mismatch (flagged)**: the prototype's score card has no backend
  counterpart — removed, not adapted. This is the only prototype-vs-contract
  conflict found.
- **UPLOADED visibility**: only reachable via server crash windows; rendered
  defensively ("Analysis in progress — refresh").
- **Sync upload latency**: a multi-second single request; Timeout/abort not
  part of the contract — UI uses one loading state and a Retry (re-select).
- No other ambiguities; no STOP conditions triggered (all five endpoints
  exist exactly as verified above).

## 12. Explicit files that must remain untouched (P3)

`server/**` (all), `docs/17*`, `docs/18-*`, `docs/18-azure-di-fallback-report.md`
(pre-existing M6 amendment evidence), M5.7/M6 source (`ai/`, `storage/`,
`middleware/upload.js`), `client/src/services/api.js` (auth interceptors),
`client/src/context/{AuthContext,UserContext}.jsx`, `vite.config.js`,
`client/src/services/{authService,userService,analyticsService}.js`.

## 13. Exact acceptance criteria for M7-P3

1. `POST /resumes` with a PDF → 201 ANALYZED; analysis fields rendered (no
   score).
2. Valid-format garbage file → 201 FAILED with `failureReason`
   (`RESUME_TEXT_EXTRACTION_FAILED` label).
3. >5MB → client pre-check rejects before network, and server 400
   `FILE_TOO_LARGE` also surfaces if bypassed.
4. Non-PDF/DOCX or extension/MIME mismatch → 400 message rendered.
5. List: `GET /resumes` rows; select → `GET /resumes/:id` detail; empty state
   when none.
6. Download: `GET /:id/download` → opens `url`, displays `filename`,
   notes 15-min expiry; fresh URL per request.
7. Delete: `DELETE /:id` → 204 → list refetched; row gone.
8. Loading/error/empty states present on both pages; 401 → redirect to login.
9. Zero modifications under `server/`; zero Azure/Supabase/Gemini client
   references; `createMockResponse` untouched for P4.
10. `vite build` passes; backend suite remains 176/176.
11. Files touched = exactly §3 (new) + §4 (modified) − §5 (deleted).

---

**STOP — awaiting approval.**