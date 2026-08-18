# Azure Document Intelligence P2 Amendment Report

Status: RECOMMENDED AS OPTIONAL (env-gated fallback only) — awaiting approval, nothing implemented.
Date: 2026-08-18.

## 1. Audit question

P2 (local text extraction) is implemented and CLOSED (docs/17 §10): `textExtractor.js`
handles PDF (pdf-parse v2) and DOCX (mammoth), the upload middleware validates
size/MIME/content/filename, and the sync POST flow is covered by
`tests/m6-resume-upload.test.js`. Question: **is amending P2 with an Azure Document
Intelligence fallback better than the implemented local-only state?**

Method: the 20-section read-only audit (pricing/limits/format support verified against
current product docs) run against the *implemented* code, not the design. No code was
changed and nothing was installed to produce this report.

## 2. Implemented state being audited (verified in code)

- `storage/textExtractor.js` — the ONLY parsing module. Local parse → `extractText(buffer, mime)`
  returns plain text or throws `ResumeTextExtractionError` (RESUME_TEXT_EXTRACTION_FAILED, 400).
- `middleware/upload.js` — 5MB cap, PDF/DOCX allowlist, magic-byte sniff, filename sanitize.
- `resume.service.js` create flow — upload → doc (UPLOADED) → extraction → ANALYZED|FAILED.
- `package.json` — pdf-parse ^2.4.5, mammoth ^1.11.0, multer; no new deps needed for an amendment.
- Unreadable/empty text → FAILED with `RESUME_TEXT_EXTRACTION_FAILED` (docs/17 D4: object kept).

## 3. The concrete gap

| Input | Implemented local stack | Azure DI (prebuilt-read) |
|---|---|---|
| Text PDF | ✔ | ✔ |
| DOCX | ✔ | ✔ |
| **Scanned/image-only PDF** (OCR) | ✖ — empty text → FAILED | ✔ |
| Password-locked/highly damaged PDF | ✖ → FAILED | ✖ (must be unlocked; damaged fails too) |

A scanned resume is a real, common upload. Today it hard-fails with
`RESUME_TEXT_EXTRACTION_FAILED` and the user must delete + re-upload a text PDF. That is
the only user-visible hole in the implemented extraction path.

## 4. Verified Azure facts (2026-08, v4.0 `2024-11-30` GA)

- **F0 (free): 500 pages/month total**; only the **first 2 pages** analyzed per request
  (**silently truncated, no error**); **4 MB max**; **1 analyze TPS**; quota exhaust → 403
  with a possible 24h burst cooldown.
- **S0 (paid)**: 500 MB, 2,000 pages/req, 15 TPS. Read **$1.50 / 1,000 pages**; Layout and
  other prebuilts **$10 / 1,000 pages**.
- Formats: PDF + images (JPEG/PNG/BMP/TIFF/HEIF) on all models; **DOCX/PPTX/XLS on Read and
  Layout only** (prebuilt/custom do not accept Office files). DOCX page unit = 3,000 chars;
  embedded images in DOCX not analyzed; OCR works on scanned PDFs (treated as images).
- Read ≈ OCR text/lines/words/paragraphs (+ handwriting, searchable-PDF feature). Layout =
  Read + tables/roles/reading order/markdown. The analyzer consumes **plain text only**
  (docs/07) → Layout's extra structure and $10/1k price buy nothing here. Use `prebuilt-read`.
- Privacy/retention (MS product docs): inputs stored **encrypted in the resource region**
  during processing; outputs retained transiently for async retrieval and auto-deleted
  (~24h). Documents are **not used for training**. Deleting the resource deletes models in
  region. Claimed scope: no "zero retention" — results persist up to ~24h.

## 5. Option analysis against the implemented state

| | A: Azure primary | B: Azure preferred, local fallback | C: local primary, Azure fallback (recommended) |
|---|---|---|---|
| Change to implemented path | replaces working local parse | swaps default (rewrite tests) | additive, env-gated, empty-text-only |
| Cost surface | F0 caps hit on every upload; silent 2-page truncation | Azure burn on every upload | Azure touched ~once per scanned resume |
| Latency | +3–10 s on every upload | +3–10 s on every upload | +3–10 s only on fallback |
| Offline/zero-cost posture | lost | lost | preserved (default path unchanged) |
| M5.7 / orchestrator / analyzer | untouched in all three (fallback lives inside the extraction boundary) | | |
| 5MB contract vs F0 4MB direct | broken (needs URL submission) | same | same — fallback already has signed URLs available |

## 6. Verdict

**Yes — the amendment is better, scoped as Option C only.** It closes the one real gap
(scanned/image-only PDFs → OCR) without changing the implemented default path, without new
dependencies, without touching the AI pipeline, and without making Azure a hard
requirement: when `AZURE_DI_ENABLED` is unset, behavior is byte-identical to today. Azure
as primary (A) or automatic (B) is rejected: F0's 500-page/month cap, silent 2-page
truncation, 4MB direct limit and 1 TPS make it unfit as the default; S0 would make every
upload a paid call.

## 7. Design (if approved — zero changes to what is implemented)

```
extractText(buffer, mime)                     [unchanged entry point]
  → local parse (pdf-parse | mammoth)         [unchanged, always first]
  → if result non-empty: return it            [today's exact behavior]
  → if empty AND AZURE_DI_ENABLED=true:
       signedUrl = storageClient.signedUrl(storageKey)   [existing plumbing, D2]
       POST {endpoint}/documentintelligence/documentModels/prebuilt-read:analyze
           ?api-version=2024-11-30   body { urlSource: signedUrl }   [api-key header]
       poll GET result (3s interval, DI_TIMEOUT budget)
       normalize content → plain text (paragraphs joined, trimmed)
       page-count guard: if analyzeResult pages < document pages → treat as truncation failure
  → empty or any Azure failure → ResumeTextExtractionError (unchanged FAILED semantics)
```

- Azure knowledge stays inside the extraction boundary (`storage/textExtractor.js` + one
  submodule, mirroring the providers/ isolation pattern) — resumeAnalyzer, orchestrator,
  registry, M5.7 untouched.
- Signed URL submission keeps the private bucket private (short-lived bearer, D2 15 min TTL
  outlives the poll) and works around F0's 4MB direct-body cap for our 5MB contract.
- No new npm dependencies: plain `fetch` (repo precedent, groq.js).

## 8. Files that would change (only if approved)

- `storage/textExtractor.js` — empty-text branch calling the fallback (seam only).
- `storage/azure.di.extractor.js` (new) — fetch client, poll, normalize; mockable module.
- `config/di.js` (new) — module-level guard (D5-a pattern) on AZURE_DI_*; untouched until
  AZURE_DI_ENABLED=true.
- `config/env.js` + `.env.example` — declare vars (optional-tier, like the M5.7 AI_* vars).
- `tests/m6-resume-upload.test.js` — new mocked-fallback cases; existing 549 lines unchanged.

## 9. Where the keys go (when approved)

`server/.env` (exists, gitignored — never commit; `service_role` precedent docs/17 §9.1):
```
AZURE_DI_ENDPOINT=https://<resource-name>.cognitiveservices.azure.com/
AZURE_DI_KEY=<Key 1 — Azure portal → Document Intelligence resource → Keys and Endpoint>
AZURE_DI_MODEL=prebuilt-read
AZURE_DI_ENABLED=true
```
Server-side only. Missing/unset → fallback simply never runs; extraction config never
fails startup (unlike storage, DI is optional by design).

## 10. Test strategy (zero quota, zero network, deterministic)

Mock `azure.di.extractor.js` via `node:test` `mock.method` (m5.1 pattern, same as the
storage seams in m6-resume-upload.test.js). Cases: fallback fires only on empty local text
(non-empty PDF/DOCX fixtures must NOT hit it); Azure 403/429/5xx/timeout → clean
`ResumeTextExtractionError`; page-count truncation detection; `AZURE_DI_ENABLED=false` →
never called; no credential leakage in errors. Live smoke: manual one-shot script, never
part of the suite.

## 11. Risks

F0 caps/cooldown (mitigated: fallback-only + optional); silent 2-page truncation (mitigated:
page-count guard above); +3–10 s latency on fallback only; resumes transiently stored
encrypted in Azure ~24h — a privacy boundary requiring disclosure if enabled for real users;
Azure availability only matters while the feature is enabled.

## 12. Decision

APPROVE the amendment as **option C (optional, env-gated, empty-text-only fallback via
`prebuilt-read` over signed URLs)** — or keep P2 exactly as implemented; both are sound.
Next step is your call; nothing is implemented or installed pending it.