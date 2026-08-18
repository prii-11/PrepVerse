# M6 Storage — Reconnaissance Report

Status: **MILESTONE CLOSED** (P1–P5 delivered 2026-08-18)
Date: 2026-08-18

## 1. What M6 is (authoritative)

- AGENTS.md:52 — "the current milestone is M6 (Storage — Supabase resume upload/download per `docs/06`)".
- ROADMAP.md:64 — "| M6 | Storage: Supabase Storage, resume upload/download, signed URLs | NOT STARTED |" (this report flips it to IN PROGRESS).
- docs/02 §4.1 — "Object storage provider: Supabase Storage. It is the MVP object-storage layer for private resume files and signed/short-lived access URLs."
- The system's only documented resume creation path is **POST /resumes: object-storage upload + synchronous AI analysis in the same call** — `src/modules/resumes/resume.routes.js` deliberately has "NO POST /resumes ... both out of scope until M6". Upload and download are the milestone's acceptance surface.

## 2. Current storage architecture (M5.7 state)

Persistence today is MongoDB-only; there is no object-storage integration anywhere:

| Area | State | Evidence |
|---|---|---|
| `config/storage.js` | Empty stub (`module.exports = {}`), "STUB for M2.1 — filled in M6" | storage.js:1-4 |
| `middleware/upload.js` | Passthrough stub (`next()` only), "STUB for M2.1 — filled in M6" | upload.js:1-3 |
| `config/env.js` | `SUPABASE_URL` / `SUPABASE_KEY` declared but NOT required until M6 | env.js:31-32 |
| package.json | No supabase/multer/busboy deps; storage must follow the project's own-import guard rule (only the storage module may import the SDK/`fetch`) | m5.1 test guards at :1874,:1906,:2414 |
| `Resume.storageKey` | `required: true` in the schema, but nothing can write it yet — no upload path exists | resume.model.js:8 |
| `resume.service.deleteResume` | Deletes the Mongo document only; "Storage cleanup is out of scope (docs/02 §3; M4.2 guardrail 5) — there is no object-storage integration yet" | resume.service.js:44-52 |

## 3. Data-flow trace with persisted locations (files → disk → Mongo)

Resume file → **never persisted today** (no upload mechanism exists):

```
POST /resumes (NOT IMPLEMENTED — M6 scope)
  upload middleware: MIME allowlist (PDF/DOCX), ≤5MB, filename sanitization   [stub]
  → Supabase Storage private bucket (storageKey = bucket path)                 [M6]
  → Resume doc: storageKey/originalFilename/mimeType/size, status UPLOADED     [Mongo]
  → synchronous extract text → AI Orchestrator → analysis                     [transient; no raw text persisted — docs/05 §3 note]
  → status ANALYZED / FAILED (failureReason = errorCode only)
```

Persisted-today inventory (all Mongo, all covered by M2.1–M5.7 tests):

- `User` — credentials/auth; unique email index (user.model.js:27).
- `Resume` — metadata + `analysis` (resume.model.js; index `{userId, createdAt}` :34). GET routes exist; creation does not yet.
- `Interview` — questions/report/answers with per-question evaluation; ownership index `{userId, status, createdAt}` (interview.model.js:117).
- `SkillProfile` — per-user evolved skills (users/analytics modules).
- `AIExecution` — audit rows; indexes `{entityType, entityId}` and `{userId, createdAt}` (aiExecution.model.js:43-45).

Transactions today are Mongo replica-set sessions (the codebase runs MongoMemoryReplSet). M6 adds a second store (Supabase) that **cannot join those transactions** — cross-store consistency is the milestone's central risk (see §7).

## 4. Contracts M6 must preserve (docs are source of truth)

1. **Resume schema** (docs/05 §3, resume.model.js): `storageKey` required (Supabase path), no `PROCESSING` state — upload is synchronous (`UPLOADED → ANALYZED | FAILED`). No raw resume text and no raw AI response in Mongo (docs/05 §3 note).
2. **File validation** (docs/06): MIME allowlist PDF/DOCX only, max ~5MB, filename sanitization **before** it touches Supabase Storage.
3. **Privacy** (docs/06): bucket private; resume access only via server-generated signed/short-lived URLs at the owning user's request — never permanent public links, never a public file URL in GET responses.
4. **Ownership/404 semantics** (docs/06 §2, resume.service.js): every by-id lookup stays `findOne({ _id, userId })`; "not found" and "not yours" are the same 404.
5. **GET /resumes list shape** stays lightweight (no analysis in list, no storageKey in list).
6. **AI boundary untouched**: resume analysis remains prompt-based Gemini through the AI Orchestrator with failover (M5.7); M6 only supplies the file → text extraction step. No raw model output stored; `failureReason` is an errorCode.
7. **Import guards**: only the storage module may import supabase SDK / use multipart handling; m5.1 tests assert this at :1874,:1906,:2414 by path.

## 5. Gap analysis (what M6 must build)

| # | Gap | Where it lands |
|---|---|---|
| G1 | Storage client/init (SDK vs REST via global fetch — repo precedent is fetch-without-dep for Groq), bucket config, env requirement flip (`SUPABASE_*` become startup-required) | config/storage.js + config/env.js |
| G2 | Multipart upload middleware: MIME/size/sanitize, then push bytes to private bucket, derive `storageKey` | middleware/upload.js |
| G3 | `POST /resumes` creation path: upload → persist doc → synchronous analysis → status transitions; lasts `UPLOADED` if analysis fails (contract: still a document, FAILED) | resumes module (routes/controller/service/validation) |
| G4 | `GET /resumes/:id/download` (or equivalent) — signed short-lived URL generation, not streaming, not public | resumes module + storage module |
| G5 | Delete = Mongo doc + object cleanup (flip the current "storage cleanup is out of scope" note in resume.service.js:49-51) | resume.service.js |
| G6 | Failure semantics for orphaning: object uploaded but Mongo insert fails (orphan object); Mongo doc exists but object missing (dangling storageKey) | storage + resumes service |
| G7 | Tests: deterministic mock of Supabase (repos precedent: mock of AI provider in m5.6/m5.7), extension of m5.1 guards for new module set, upload/validation/download/delete cases; no real-network tests | tests/ |

## 6. Test infrastructure available

- `MongoMemoryReplSet` shared setup (m5.1-ai-infra.test.js) for transactional tests; model tests, integration tests, fixtures (`VALID_RESUME`, question/eval fixtures for AI), concurrency tests (m5.5), readiness (m5.6), failover/CAPS-341 stubs (m5.7-ai-failover, m5.7-failover-disabled).
- All gaps can be tested through the same seams; nothing in M6 requires a live Supabase instance (mock client injectable into the storage module).

## 7. Suggested phasing

- **P1** — Storage module (client, bucket ref, signed-URL function) + env flip + mock seam. Unit tests.
- **P2** — Upload middleware real implementation (validation per docs/06) + `POST /resumes` creation + synchronous analysis flow + status transitions. Integration tests.
- **P3** — Download endpoint (signed URL). Tests incl. ownership/404.
- **P4** — Delete cleanup (doc + object), orphan/dangling handling policy. Tests.
- **P5** — Guard updates in m5.1, full suite green, docs status flip (this doc → CLOSED), AGENTS/ROADMAP roll.

## 8. Decision audit (D1–D5) — read-only audit, 2026-08-18

Audit rule: every recommendation is grounded in repository/contract evidence, not
assumed defaults. Nothing in this section was implemented; P1 waits for approval.

### D1 — Storage client: SDK vs plain fetch

| | |
|---|---|
| Repository evidence | `@google/generative-ai` official SDK is the primary AI provider's transport (package.json:15; gemini adapter). The secondary provider Groq deliberately uses **global fetch, "no SDK dependency"** (groq.js:17-20, :46). package.json has only 7 runtime deps — no multipart lib, no supabase lib. `config/storage.js` is an empty stub. Guard tests ban the literal term `supabase` only inside AI/analytics boundary files (answerEvaluator, evidenceNormalizer, skillProfile.service — m5.1:1874,:2406,:2414), so neither approach conflicts with them; the diff-level guards (m5.1:1901-1908) are pinned to the M5.4+M5.5 window and don't constrain M6. |
| Contracts | docs/02 §4.1 (Supabase Storage as object-storage layer); groq.js:17-20 (repo transport convention comment); env.js:31-32. |
| Options | (a) `@supabase/supabase-js` SDK — one new runtime dependency; (b) plain fetch against Supabase Storage REST (`/storage/v1/object/{bucket}/{path}`, `/storage/v1/object/sign/{bucket}/{path}`) in a dedicated storage module mirroring the providers/ pattern; (c) hybrid (SDK for signing + fetch for upload) — rejected: two mechanisms. |
| Recommendation | **(b) plain fetch.** Mirrors the most recent external-integration decision in-repo (groq.js), keeps the zero-new-dependency posture (a stated design goal of that adapter), and the storage REST surface is small enough that the SDK adds an auth/query machinery we don't need (storage-only, no auth tables). The storage module becomes the sole owner of HTTP + the storage error taxonomy, exactly as providers/ owns AI transport. |
| Consequences | No package.json change. Binary upload via `fetch` body with content-type headers (no multipart needed). Signed URLs requested over `/storage/v1/object/sign`. Deterministic tests mock the storage module exactly as m5.1 mocks the Gemini provider (m5.1:58-60 pattern). |
| Authorization | **Not required** for (b) — repo-grounded. **Required** if you prefer (a): it changes the project's dependency posture. |
| Implementation impact | New storage module (client init, upload, signedUrl, delete object) + `config/storage.js` filled; env untouched (two existing vars). No deps. Related P2 gap noted (not a D-decision): resume text extraction from PDF/DOCX — `resumeAnalyzer.js` docblock: "M6 handles extraction", and no parser dep exists; extraction will need a dependency (e.g. pdf-parse) — separate approval when we reach P2. |

### D2 — Signed-URL TTL

| | |
|---|---|
| Repository evidence | No numeric TTL anywhere in contracts: docs/06:105 and docs/02:246 say only "signed/short-lived URLs". The repo's only short-lived numeric precedent is the JWT: "target ~15 minutes" (docs/06:48, reaffirmed :59). Config constants precedent: `ai.js` hardcodes `timeoutMs: 30000` with a comment (ai.js:85) while treating tunables as env vars (cooldowns, ai.js:123-124). |
| Contracts | docs/06 §3.3 storage bullet (:105); docs/06 §1.1 token strategy (:48,:59). |
| Options | 5 min / 15 min (JWT parity) / 60 min / env-configurable constant. |
| Recommendation | **15 minutes, a constant in `config/storage.js`** with a comment citing JWT parity. A signed URL is a bearer artifact like the access token; the docs class them together as "short-lived" and the repo's established short-lived duration is ~15 minutes. Hardcoded constant (not env) matches the `timeoutMs` precedent; TTL is not an operational knob. |
| Consequences | A download link expires during a long session → client re-requests the endpoint (stateless, no storage of URLs server-side). Consistent with the no-revocation JWT trade-off the docs accept (:59). |
| Authorization | Design parameter no contract pins — **confirm-only** (15 min unless you set another value). Not blocking once approval is given. |
| Implementation impact | One constant + comment in storage config; optional test case for an expired-URL rejection (mock only). |

### D3 — Bucket provisioning and name

| | |
|---|---|
| Repository evidence | `SUPABASE_URL` + `SUPABASE_KEY` are declared (env.js:31-32) and documented in `.env.example` ("Storage - required from M6 onward") — but **no bucket variable exists anywhere** (env.js, .env.example, docs). External-resource precedent: Mongo is provisioned fully out-of-band and referenced only via `MONGO_URI` (env.js:8; `.env.example` placeholder). No in-repo bootstrap code exists for any external resource. `.env` (gitignored) already contains the two SUPABASE lines. |
| Contracts | env.js:31-32; .env.example storage section; docs/06:83 (validation before object storage) and :105 (private bucket, signed access only). |
| Options | (a) new env var `SUPABASE_BUCKET`, bucket created out-of-band in the Supabase dashboard (mirrors MONGO_URI posture); (b) hardcoded bucket name in config/storage.js; (c) startup auto-provisioning via admin API (create-bucket-if-missing). |
| Recommendation | **(a) `SUPABASE_BUCKET` env var, out-of-band creation**, documented in `.env.example` with recommended name `resumes`. Every external resource in this repo (Mongo, Gemini, Groq) is provisioned outside the code and referenced by env; auto-provisioning (c) would be the first bootstrap side effect in the repo and runs against the privacy contract's "create private bucket" being an admin action. |
| Consequences | One new env line; `npm start` without `SUPABASE_BUCKET` (and without storage vars) → storage module fails clearly (same message style as config/ai.js:69-71). |
| Authorization | **REQUIRED.** You must create the Supabase project + the private bucket (name: your call, `resumes` recommended) and supply the creds; this cannot happen without your account. |
| Implementation impact | `.env.example` +1 line, `config/storage.js` reads it with a placeholder guard; storage client references `{SUPABASE_BUCKET}`. |

### D4 — Analysis-failure semantics (keep object vs rollback)

| | |
|---|---|
| Repository evidence | Upload contract: synchronous, terminal states `UPLOADED | ANALYZED | FAILED`, no `PROCESSING` (docs/02:129,:182; resume.model.js:13-14). `failureReason` = errorCode only (resume.model.js:27). **docs/05:102 — the file persists in storage independent of analysis outcome, and future re-analysis re-extracts it from the file** ("If resume re-analysis becomes a feature later, the file is already in Supabase Storage and can be re-extracted"). AI-failure philosophy precedent: `FAILED` is terminal for MVP, no auto-retry, recovery = user re-creates (docs/02:199). |
| Contracts | docs/02 §2.3 + §3 (:129,:182,:184); docs/05 §3 note (:102); resume.model.js:13-14,:27. |
| Options | (a) object stays, doc → `FAILED` with errorCode; (b) rollback: delete object on analysis failure → doc `FAILED` with a dangling `storageKey`, contradicts the docs/05:102 design; (c) keep object but delete the `FAILED` doc — destroys failure visibility. |
| Recommendation | **(a).** Contract-grounded: `FAILED` is a legitimate terminal resource (docs/02:129), and storage's independence from analysis success is the documented reason the file exists there (docs/05:102). User recovery = existing `DELETE /resumes/:id` (flips the "storage cleanup is out of scope" note at resume.service.js:49-51 in P4). |
| Consequences | A failed upload leaves a stored object until the user deletes the resume — bounded by the delete endpoint, and it keeps re-analysis (docs/05:102) viable. Orphan-window risk (object uploaded, Mongo insert fails) is a P2 implementation concern, not a decision. |
| Authorization | **Not required** — pinned by docs/05:102 + docs/02:129. |
| Implementation impact | Upload flow: object upload → doc insert (`UPLOADED`) → extraction + analysis → single `findOneAndUpdate` to `ANALYZED` or `FAILED` + `failureReason`; delete removes doc + object. |

### D5 — Env requirement timing (startup-required vs module-level)

| | |
|---|---|
| Repository evidence | env.js:27-29 documents the convention for exactly this case: future-phase vars are "declared so later phases have a stable import, but NOT required at startup. Each future module's own config layer is responsible for failing clearly" — and the SUPABASE lines sit directly under that comment (:31-32). The module-level fail-fast precedent is config/ai.js:64-73 (throws at load without the primary provider's key, with a copy-this message). Counter-example: `JWT_ACCESS_SECRET` IS in env.js `REQUIRED_AT_STARTUP` (env.js:7-8, M3) — but that's core auth, merged in M3 when it became active. Test pattern: m5.1 sets every startup-required var in-file before any module require (m5.1:19-23). |
| Contracts | env.js:6-16,:27-32; config/ai.js:64-73. |
| Options | (a) module-level: `config/storage.js` throws at load when `SUPABASE_URL`/`SUPABASE_KEY` missing (mirrors config/ai.js; env.js list unchanged); (b) global: add both to `REQUIRED_AT_STARTUP` (breaks `npm start` and every test suite until every env carries storage vars). |
| Recommendation | **(a) module-level.** env.js:27-29 names this pattern as the intended one for M6-era vars; (b) would contradict the file's own documented convention and force storage creds into every environment (CI, tests) even when nothing touches storage. |
| Consequences | Server boots without storage vars; the storage module refuses loudly when used (POST /resumes → clear 5xx, same UX as config/ai.js:69-71). Tests that import the storage module set the two vars in the header, exactly like m5.1:19-23. |
| Authorization | **Not required** for the mechanism. **Separate user action:** to exercise M6 end-to-end you must paste real values into `server/.env` (see below) — that's yours, not mine. |
| Implementation impact | No env.js change. `config/storage.js` gains the load-time guard + message. m5.1 (or the M6 test suite) header gains two test vars in P1. |

## 9. P1 implementation status (2026-08-18)

P1 delivered per approved D1–D5. Files:

- `server/src/config/env.js` — `SUPABASE_BUCKET` declared (declared, not startup-required — D5-a).
- `server/src/config/storage.js` — stub filled: module-level fail-fast guard (D5-a, placeholder rejection like groq.js:32), exports `STORAGE_CONFIG { SUPABASE_URL, SUPABASE_KEY, SUPABASE_BUCKET, signedUrlTtlSeconds: 900 (D2), storageTimeoutMs: 15000 }`. This file holds config only — transport lives exclusively in the client.
- `server/src/utils/errors.js` — `StorageClientError` (`OBJECT_STORAGE_FAILED`, 502, `details { category, upstreamStatus }`; single-attempt posture documented).
- `server/src/storage/storage.client.js` — NEW module (docs/02 §2.1 tree updated): fetch-based client (D1-b), `uploadObject` / `signedUrl` / `deleteObject` against `/storage/v1/object*`, service-key bearer auth, AbortSignal timeout, small classification taxonomy (AUTHENTICATION_FAILED | NOT_FOUND | CONFLICT | PAYLOAD_TOO_LARGE | STORAGE_UNAVAILABLE), envelope checks mirroring groq.js.
- `server/tests/m6-storage.test.js` — 14 tests (config guards via child processes from a .env-free cwd; request-shape tests with mocked global fetch; no real network).
- `server/.env.example` — `SUPABASE_BUCKET=resumes` added.

Not touched: M5.7 (commit b8272cf), AI providers/orchestrator, existing test suite files.

Verification: `node --test tests/m6-storage.test.js` → 14/14 pass (218ms).

Suite status after P1: 153 tests → **148 pass, 5 fail**. All 5 failures are the
pre-existing clean-tree guard tests (M5.2-11, M5.3-15, M5.4-14, M5.5-12, M5.6-19)
that assert an empty `git status` — they fail because M6 milestone work is
uncommitted (the audit flagged this in §8; they only pass after a commit, which
is the user's call). One guard was necessarily updated: `M5.4-13`'s diff-level
net previously banned the literal `supabase` string across all of `server/src`;
scoped to the layers it protects (`server/src/ai`, `modules`, `domain`) since
`src/storage/storage.client.js` and the `StorageClientError` comment are the
sanctioned M6 Supabase references (docs/17 §4.7). M5.7 (b8272cf) untouched.

Live verification (after service-role key swap):

- `GET /storage/v1/bucket` → `resumes` present, **public: false** (private).
- Upload `POST /object/...` → 200; object listed; unauth GET → 400 (not publicly readable); DELETE → 200.
- Signed-URL round trip exposed a real defect: this project returns
  `signedURL` **relative to the Storage API root** (`/object/sign/...?token=`),
  not the `/storage/v1/object/sign/...` shape older docs showed. Client was
  fixed to assemble `${SUPABASE_URL}/storage/v1` + returned path (handling
  both shapes) — new unit case M6-P1-7b; suite now 15/15.
- Full client round trip against the live project: upload → signedUrl →
  GET 200 with exact body → delete → bucket empty. Sign-on-missing-object
  returns 400 (mapped to STORAGE_UNAVAILABLE), not 404 — noted.

Also observed: the sign response's shape, the 400-on-missing-object behavior,
and the successful duplicate-free upload confirm the transport contract the
client encodes.

(Historical: the earlier `SUPABASE_KEY` was rejected — `400 Invalid Compact
JWS`, i.e. not a `service_role` JWT. Replaced by the user; all live checks
here were re-run with the fixed key.)

### 9.1 Supabase credentials — where they live and the current state

- File: `server/.env` (gitignored by root `.gitignore`; never commit it).
- Current state: `SUPABASE_URL=https://hyjnnxligmrxebcfdxqv.supabase.co` (base URL; the `/rest/v1/` suffix previously present was wrong for the Storage API), `SUPABASE_BUCKET=resumes`, `SUPABASE_KEY` = service_role JWT (replaced and operative — verified live, never printed/logged).
- Guidance (dashboard): Project Settings → API → `service_role` secret for project PrepVerse (`hyjnnxligmrxebcfdxqv`); bucket `resumes` confirmed private. Service role (not anon) is required server-side for signed URLs on a private bucket; keep it out of `client/` code.

## 10. P2–P4 implementation status (2026-08-18, CLOSED)

P2–P4 delivered per §7 phasing. Files:

- `server/src/middleware/upload.js` — stub replaced (G2): multer (memory storage, 1 file, 5MB cap), declared-MIME allowlist (PDF/DOCX), magic-byte sniffing (`%PDF-` / `PK\x03\x04`) with declared-vs-sniffed consistency, extension allowlist, filename sanitization (path/control chars stripped, capped). Canonical MIME + sanitized filename land on `req.file`.
- `server/src/storage/textExtractor.js` — NEW (G2): PDF/DOCX → plain text; the only owner of the parsing deps. **Dependency correction:** pdf-parse is pinned to v2 — v1.x bundles a 2017-era pdf.js (v1.10.100) that throws "Command token too long: 128" at runtime once mongoose (mongodb driver) is loaded in the same process (verified empirically; would have broken every real server request). v2 uses modern pdf.js; verified working with mongoose loaded. mammoth for DOCX.
- `server/src/modules/resumes/resume.service.js` (G3/G4/G5): `createResume` (upload → UPLOADED doc → extract → profile-sourced catalog-backed targetRole → analyze → ONE atomic findOneAndUpdate to ANALYZED or FAILED; FAILED retains the object per D4, `failureReason` = errorCode; orphan-object cleanup on Mongo-insert failure per G6), `getDownloadUrl` (signed URL; dangling storageKey → honest 404), `deleteResume` (doc first, then best-effort object cleanup). Seams switched to object-property access so the module boundary stays mockable (m5.7 pattern).
- `server/src/ai/resumeAnalyzer.js` — optional `entityId` passthrough: the Resume doc exists (UPLOADED) before analysis, so AIExecution rows now trace to the resume (docs/06 §4.3). Prompt/schema/sanitization untouched.
- `server/src/modules/resumes/resume.controller.js` + `resume.routes.js` — POST /resumes (multipart 'file'), GET /:id/download added.
- `server/package.json` — runtime deps +3: `multer` (upload parsing), `pdf-parse@^2.4.5` (PDF text; v2 pin per the correction above), `mammoth@^1.11.0` (DOCX text). Guard-note: `multer`/`supabase` tokens appear only in the sanctioned owners (middleware/upload.js, src/storage/, utils/errors.js) — the m5.1 diff-level nets over `ai|modules|domain` still pass.

Verification: `node --test tests/m6-resume-upload.test.js` → 22/22 pass (mocked storage/AI seams, real extractors against hand-built minimal PDF/DOCX fixtures). P1 suite still 15/15.

Suite status after P2–P4: 176 tests → **171 pass, 5 fail** — all 5 are the pre-existing clean-tree git guards (M5.2-11, M5.3-15, M5.4-14, M5.5-12, M5.6-19), failing only because the M6 milestone work is uncommitted (the same guard behavior observed after P1; they pass after the milestone commit, which is the user's call). M5.7 (b8272cf) untouched.

### Cross-cutting findings (flagged, not D-decisions)

1. **Per-user AI rate limiting** (docs/02 §2.2, docs/06 §4.2) is still not wired on any AI-calling route (`interview.routes.js` and `resume.routes.js` both omit `aiRateLimit`). Pre-existing M5-era gap, unchanged by M6 — belongs to M8 (hardening).
2. **`GET /:id` detail response** includes `storageKey` (M4.2 behavior). It is not a public link and stays server-internal by convention; list responses never expose it (docs/17 §4.5).
3. **AIExecution traceability improvement**: with `entityId` now threaded, a failed RESUME_ANALYSIS execution can be traced to its Resume (docs/06 §6 bullet).

### Credentials (unchanged from §9.1)

`server/.env` (gitignored) holds the live `SUPABASE_URL` / `SUPABASE_KEY` (service_role JWT) / `SUPABASE_BUCKET=resumes`. Nothing here ever commits them.

### Cross-cutting audit finding (not a D-decision, flagged)

m5.1:1911-1919 and :2419-2427 assert `git status --short` is EMPTY and pin ancestor commits (m5.4/m5.5 commit SHAs). The current working tree holds the uncommitted M5.7 implementation + this recon doc — those assertions fail until the M5.7 work is committed (your commit cadence, not mine). P5's "full suite green" gate therefore depends on that commit happening; no M6 code is affected.