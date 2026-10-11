# Azure Document Intelligence — Extraction-Fallback Audit & Delivery (M6.1)

Status: **APPROVED and IMPLEMENTED** (local-first → env-gated Azure DI fallback).
Date: 2026-08-20. Supersedes/confirms `docs/18-azure-di-fallback-report.md` (which recommended
the same Option C, pending approval — this is that approval, with the audit re-run against the
implemented code and the design delivered).

Audit scope: read-only analysis first (nothing changed to produce the findings); then, on
approval, the exact footprint below was implemented and verified by the full `npm test` suite
(205 tests, all green).

## 1. Executive decision

**APPROVE — local-first, Azure Document Intelligence fallback**, scoped exactly as follows:

- **Trigger: empty local extraction only.** A scanned/image-only PDF parses fine locally but
  yields no text — the one real gap (docs/18 §3). Parser exceptions (corrupt/unreadable input)
  are input/document failures and are **never** sent to Azure.
- **Input: a fresh server-generated signed URL** of the private resume object (existing
  `storageClient.signedUrl`, 15-min TTL D2), handed to DI's `urlSource` — NOT backend-read
  bytes and NOT the user-facing download URL.
- **Model: `prebuilt-read`** (OCR to plain text). Layout's structure buys nothing for the
  plain-text ResumeAnalyzer contract and costs ~6.7x more.
- **Bounded behavior: one analyze submission + poll loop** under `AZURE_DI_TIMEOUT_MS`
  (default 60s). No retry, no backoff, no cooldown, no circuit breaker, no health state.
- **Key-boundary: DI must never enter the M5.7 AI chain.** Azure is a document-extraction
  provider, not an AI provider candidate (docs/18 §0; docs/16 §1).
- Env-gated: when `AZURE_DI_ENABLED` is unset, behavior is byte-identical to M6 (proven by
  the untouched existing suites).

Rejected: backend-read-and-forward bytes (breaks contracts, §3), Layout model (§4), any
extraction provider framework/resolver/registry/health store (no concrete second-fallback
requirement), any AIExecution involvement for extraction (§11, §15).

## 2. Existing M6 extraction architecture (verified in code)

`server/src/storage/textExtractor.js` — the ONLY parsing module:

- `extractText(buffer, mimeType)` → `Promise<string>`, Buffer-in/text-out, no persistence,
  no HTTP (`textExtractor.js:42-69`). PDF via `pdf-parse` v2, DOCX via `mammoth`.
- PDF path trims, strips parse-noise footers; DOCX returns raw `result.value`
  (`:30-40`); empty-after-trim throws `ResumeTextExtractionError`
  (`RESUME_TEXT_EXTRACTION_FAILED`, 400 — `errors.js:65-69`).
- Single production caller: `resume.service.js:112` inside `createResume`
  (upload → doc UPLOADED → extraction → `resumeAnalyzer.analyzeResume` → atomic
  ANALYZED|FAILED). Any extraction failure is consumed → `finalizeFailed(...,
  'RESUME_TEXT_EXTRACTION_FAILED')` → HTTP 201 FAILED resource (`resume.service.js:110-115,
  144-153`). Unsupported types never reach the extractor (upload middleware allowlist +
  magic-byte sniff, M6-P2-3/4/5).

## 3. Existing M5.7 boundary

`ai/orchestrator.js` runs **generative** operations (`RESUME_ANALYSIS`, `QUESTION_GENERATION`,
`ANSWER_EVALUATION`) with per-attempt AIExecution rows, candidate chains, health cooldowns,
JSON schema validation, correction retry (docs/16). Azure DI performs **document extraction**
and shares none of that failure semantics (malformed PDF ≠ quota exhaustion; cooldowns cannot
fix a corrupt file). Reuse the resilience PRINCIPLE, never the implementation — the audit
independently re-derived the same boundary docs/18 §0 states.

## 4. Azure's exact role

A document-extraction fallback, visible only as: `Resume status stays UPLOADED → (empty local
text + DI enabled) → DI OCR → normalized text → ResumeAnalyzer`. The frontend never learns
which extractor ran (M6 contract unchanged). Azure never participates in AI candidate
resolution, AIExecution, schema correction, provider health, answer evaluation, question
generation, or resume-analysis generation.

## 5. Data flow (as implemented)

```
POST /api/v1/resumes (multer, allowlist+sniff+size)
  → storageClient.uploadObject (private bucket)
  → Resume doc UPLOADED
  → textExtractor.extractText(buffer, mime, { storageKey })
      ├─ local parse (pdf-parse | mammoth)                [always first, unchanged]
      ├─ non-empty → return                              [today's exact behavior]
      └─ empty AND DI_CONFIG.enabled AND storageKey →
           storageClient.signedUrl(storageKey)           [existing plumbing, fresh URL]
           → azure.di.extractor.extractDocument(url)     [prebuilt-read, urlSource]
           → poll until succeeded/failed/timeout
           → normalize (content | paragraphs) → trimmed text
           → return                                      [AZURE FAILED → FAILED path]
  → ResumeAnalyzer → orchestrator RESUME_ANALYSIS → ANALYZED | FAILED (unchanged)
```

## 6. Supabase → Azure input path

**Decision: signed-URL submission (option B), rejected backend-read-bytes (option A).**

Repository-contract evidence:

| Criterion | A: backend reads, forwards bytes | B: backend signs URL, Azure fetches |
|---|---|---|
| 5MB upload contract (upload.js MAX) vs Azure F0 4MB max doc size | violates on its face; base64 inflation makes it worse | URL submission fetches out-of-band; Doc size limit applies at Azure fetch |
| Storage client surface | needs NEW `downloadObject` (storage.client.js:146 exports only upload/sign/delete) | reuses existing `signedUrl` (D2, 15-min TTL) |
| Memory/bandwidth | backend buffers + base64 (2x net) | none beyond the small URL |
| Failure behavior | one more upstream hop the backend owns | DI owns the fetch; timeout covered by poll budget |
| F0 compatibility | broken (4MB direct cap) | works (URL fetch is the documented path) |

The existing user-facing download URL is **not** repurposed: the fallback issues a fresh
server-generated signed URL whose only consumer is Azure's analyze call; the user endpoint
(`getDownloadUrl`, resume.service.js:158-175) is untouched (M6-P3 tests stay green).

## 7. Model recommendation: prebuilt-read (confirmed)

- `prebuilt-read`: OCR (incl. handwriting) of scanned PDFs/images + text PDFs + Office
  (DOCX/PPTX/XLS), returns lines/words/paragraphs + `content` in reading order, with searchable-PDF
  output. Price ~$1.50 / 1,000 pages on S0 (docs/18 §4, verified against current product pages).
- `prebuilt-layout`: adds tables/roles/reading-order/markdown — ~$10 / 1,000 pages.
- ResumeAnalyzer consumes **plain text only** (docs/07 §2: `<resume>` template; no schema
  depends on document structure). Layout buys nothing today; custom models are out of scope
  (no requirement). `read` is sufficient — the implementation's default
  (`AZURE_DI_MODEL=prebuilt-read`, config/di.js).

## 8. Output normalization

`azure.di.extractor.normalizeResult`: prefer `analyzeResult.content` (reading order,
newline-separated) → fall back to per-paragraph `content` join (each trimmed, empties
filtered) → `trim()`. Empty/absent → `AzureDiError('EMPTY_RESULT')` → FAILED at boundary.
Reading order, page boundaries, and encoding (UTF-8 JSON) are handled by DI Read; no page
markers are useful downstream. Raw text stays transient (nothing persisted, nothing logged).
OCR text is bounded by DI's per-model limits (Office 8M chars; PDF pages 2,000 S0 / 2 F0) —
well above the 5MB upload bound in practice; no new cap introduced.

## 9. Local → Azure fallback rules (as implemented)

| Local outcome | Class | Fallback to Azure? |
|---|---|---|
| Parser throws (corrupt/unreadable PDF/DOCX) | input/document failure | **No** — FAILED immediately (tested EXTRACT-FALLBACK-6; M6-P2-8b unchanged) |
| Unsupported MIME (defense-in-depth branch) | input failure | **No** (unreachable; middleware blocks upstream) |
| Empty extraction | eligible local-extractor failure | **Yes** — the ONLY trigger (scanned-PDF case) |
| OOM/resource failure | extractor failure | No (indistinguishable from parse errors; no gain — documented gap) |
| Timeout | n/a | Local path has no timeout today (5MB bound caps cost) — N/A |

"Empty extracted text" is treated as an **extraction failure eligible for fallback**, not a
valid empty document (empty-check pre-exists at textExtractor.js:63 and resumeAnalyzer.js:44).

## 10. Azure failure handling (as implemented)

| Azure failure | Category (internal AzureDiError) | Public result |
|---|---|---|
| 401/403 credentials | AUTHENTICATION_FAILED | ResumeTextExtractionError → FAILED |
| 429 rate limit | RATE_LIMITED | same |
| 5xx service unavailable | PROVIDER_UNAVAILABLE | same |
| request timeout / AbortError / poll budget | TIMEOUT | same |
| 4xx invalid request / corrupt doc / bad model | INVALID_REQUEST | same |
| operation status `failed` | FAILED_OPERATION | same |
| no readable text | EMPTY_RESULT | same |

All paths funnel into the existing `RESUME_TEXT_EXTRACTION_FAILED` semantics (`resume.service.js:113-115` →
201 FAILED, D4 keeps the object). **No new public failure taxonomy** — AzureDiError is internal
to the storage boundary. Verified: M6-P2-8e, EXTRACT-FALLBACK-2/3, DI-CLIENT-7..10.

## 11. Retry / cooldown decision

**None.** One analyze submission; poll loop bounded by `DI_CONFIG.timeoutMs` (60s default,
3s interval, per-request 15s abort). No retry, backoff, cooldown, circuit breaker, or health
store. Rationale: two extractors only; the fallback fires ~once per scanned resume; no herd
problem; cost bounded by the timeout+attempt budget; Azure FAQ's retry advice targets
high-TPS callers we are not. M5.7's health infra stays in `ai/`.

## 12. Security / privacy

- Azure key: server-side only (`AZURE_DI_KEY`), never logged (DI-CLIENT-10), never in env
  example with a real value, guarded as placeholder-unset when enabled (DI-CONFIG-2/3).
- Private Supabase object: never exposed to public URL; the signed URL is short-lived (15
  min, D2) and consumed only by Azure.
- Document bytes: stored encrypted in the Azure resource region during processing; outputs
  auto-deleted (~24h); Microsoft states no training use (docs/18 §4). **Third-party
  processing boundary — requires policy/legal confirmation before enabling for real users**
  (flagged, not resolved here).
- Logging: the only log line is content-free and credential-free: `[di] azure fallback
  failed (<category>, status <n>)...` (textExtractor.js). No resume text, no URLs, no keys.
- Retention: raw extracted text remains transient (never persisted — M6-P2-8d asserts no
  text field; no new schema).

## 13. Configuration (as implemented)

| Env var | Default | Meaning |
|---|---|---|
| `AZURE_DI_ENABLED` | unset → disabled | explicit opt-in; unset = byte-identical M6 |
| `AZURE_DI_ENDPOINT` | — | `<resource>.cognitiveservices.azure.com` (trailing slash stripped) |
| `AZURE_DI_KEY` | — | subscription key (server-side only) |
| `AZURE_DI_MODEL` | `prebuilt-read` | built-in model name |
| `AZURE_DI_TIMEOUT_MS` | `60000` | whole-operation budget (analyze+poll) |

`config/di.js` — **optional tier, inverse of config/storage.js**: never fails at require when
disabled; fails fast (D5-a pattern) with every var named when enabled but missing/placeholder.
Dev/prod use the same flags; a manual live smoke (one-shot script, not part of the suite) is
the enablement gate.

## 14. Observability

Structured, content-free `console.warn('[di] ...')` line on fallback failure only (category +
upstream status). Azure fallback success needs no log (it is an ordinary extraction success);
if desired later, add a `console.info` with duration — still no content. No AIExecution rows
are created for extraction (AIExecution belongs to the M5.7 AI boundary; docs/05 §6 covers AI
calls, not extraction attempts).

## 15. Exact file footprint (as implemented)

CREATE:
- `server/src/config/di.js` — optional-tier DI config (why: per-concern config layer, D5-a pattern;
  must NOT fail-fast when disabled, so it cannot live in the required storage.js).
- `server/src/storage/azure.di.extractor.js` — plain-fetch DI client (why: separates transport
  from parsing, mirrors storage.client.js; gives tests a module seam; keeps textExtractor's
  "no HTTP" claim about itself true).
- `server/tests/m6-azure-extraction.test.js` — DI config guards, client transport, extractor
  fallback semantics (22 tests).
- `docs/21-azure-di-extraction-audit.md` — this document.

MODIFY:
- `server/src/storage/textExtractor.js` — signature widened additively:
  `extractText(buffer, mimeType, options = {})`; empty-branch fallback (why: the fallback must
  live inside the extraction boundary; `{ storageKey }` is the only new, service-owned input).
- `server/src/modules/resumes/resume.service.js` — one line: pass `{ storageKey }` at :112
  (why: the storage key is generated by the service at :80; the extractor cannot derive it).
- `server/src/config/env.js` — declare optional AZURE_DI_* (stable import, not REQUIRED_AT_STARTUP).
- `server/.env.example` — document the optional tier.
- `server/tests/m6-resume-upload.test.js` — +4 end-to-end fallback cases (8c–8f), `EMPTY_TEXT_PDF`
  fixture, azure seam.
- `server/tests/m5.1-ai-infra.test.js`, `server/tests/m5.6-readiness.test.js` —
  `M7_APPROVED_TREE_FILES` extended with the new/changed paths (these guards enforce the
  approved-tree whitelist; the approved Azure amendment was already whitelisted, docs/18).

DELETE: none. UNTOUCHED: `ai/orchestrator.js`, `ai/providers/*`, `registry/classify/health`,
AIExecution model, AI schemas, `storage/client.js`, `upload.js`, resume controller/model,
errors.js, interviews/analytics/users modules, frontend, m5.1/m5.7/m6-storage suites.

## 16. Test matrix (as implemented)

LOCAL: 1-2 existing M6-P2-1/2; 3 untouched suites as regression (205/205).
FALLBACK: 4 M6-P2-8d + EXTRACT-FALLBACK-1; 5 DI-CLIENT-1 (urlSource body, signed-URL arg) +
M6-P2-8d (azure receives signed URL of storageKey); 6 EXTRACT-FALLBACK-1/3 + M6-P2-8d
(text reaches analyzer seam); 7 EXTRACT-FALLBACK-7 + M6-P2-8f; 8 EXTRACT-FALLBACK-6
(garbage → azure never called).
AZURE FAILURE: 9 M6-P2-8e + EXTRACT-FALLBACK-2/3; 10 DI-CLIENT-6/8; 11 DI-CLIENT-7 (401/403)
+ DI-CONFIG-2/3; 12 DI-CLIENT-7 (429); 13 DI-CLIENT-7 (5xx).
DATA/SECURITY: 14 M6-P2-8d persisted-doc check + M6-P2-1 (unchanged); 15 no-content log line
(implementation review) + DI-CLIENT-10 (no key in messages); 16 DI-CLIENT-10 + no client
footprint (nothing delivered to client/); 17 M6-P3-1..4 unchanged.
REGRESSION: 18 m6-storage green; 19 m5.1 green; 20 full suite green — all verified.

## 17. M5.7 compatibility

**Zero changes required or made.** No orchestrator, provider, registry, health, classify,
schema, or AIExecution modification; no AI-first/last boundary crossed (DI-CLIENT-11 guards
the module's isolation). Fallback lives strictly upstream of ResumeAnalyzer. M5.7 failover
continues to operate on `RESUME_ANALYSIS` as before — Azure text is simply better input.

## 18. M6 compatibility

Preserved and test-verified: private Supabase storage; original document retention (FAILED
keeps object, D4); download endpoint (M6-P3); delete semantics (M6-P4); ownership
enforcement (service-layer `findOne({_id,userId})`); signed-URL behavior (M6-P1-7/7b/8);
transient extracted text; ResumeAnalyzer boundary; `RESUME_TEXT_EXTRACTION_FAILED`;
ANALYZED/FAILED lifecycle; orphan cleanup; upload validation. The only M6 files touched:
`textExtractor.js` (additive options param + empty-branch) and `resume.service.js` (one line),
both behavior-identical when DI is disabled.

## 19. Risks

- F0 caps: 4MB max doc size, 500 pages/month, silent first-2-pages truncation, 1 TPS. The
  4MB cap is a hard F0 limit for >4MB scanned PDFs (S0: 500MB, 2,000 pages) — documented.
  2-page truncation risk: a >2-page scanned resume would OCR only the first two pages; with
  an early-detection page-count guard considered but deferred (needs a local page count that
  the current pdf-parse seam does not expose; resumes are typically 1-2 pages).
- Azure availability only matters while enabled; latency +3-10s on fallback only.
- Privacy boundary (§12) — policy/legal confirmation required before production enablement.
- Quota burn: bounded (one call per fallback, poll is fast); no cooldown means a quota-struck
  key still costs one call per upload — acceptable at this scale; `AZURE_DI_ENABLED` is the
  kill switch.

## 20. Open questions (deferred, not blocking)

1. Page-count truncation guard (F0 >2 pages) — revisit if real >2-page scanned resumes appear.
2. Whether DI 429s warrant a single short backoff — none today (START SIMPLE; MS FAQ retry
  advice targets high-TPS callers).
3. Policy/legal sign-off on the third-party processing boundary (§12) before prod enablement.
4. Dev smoke test with a real F0 key before enabling in production (manual, out of suite).

## 21. Final recommendation

Option C as delivered: local-first → empty-text-only Azure DI fallback via `prebuilt-read`
over a server-generated signed URL, env-gated, bounded single-attempt behavior, entirely
inside the extraction boundary, zero M5.7/AI-pipeline involvement. Approved and shipped in
this working tree; prod enablement requires a real Azure DI resource + policy sign-off.

AZURE DI AUDIT — READY FOR IMPLEMENTATION