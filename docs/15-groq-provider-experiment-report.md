# Groq Provider Experiment Report

**Date:** 2026-08-18
**Status:** FAILED at Gate 4 (answer evaluation) — question generation PASSED all gates
**Scope:** Temporary provider experiment per the master prompt protocol. The 7-file Gemini migration remains untouched (git status verified: only the 3 experiment file edits + 1 new file beside the migration set).

---

## 1. Executive Summary

Groq (`openai/gpt-oss-20b`) was tested as a temporary alternative AI provider through the existing orchestrator without weakening any contract: prompts verbatim, 30s timeout, 429-only retry policy, JSON extraction, Zod validation gate, correction retry, sanitization, and AIExecution audit provenance all unchanged.

- **Question generation: PASSED** (Gates 1–3; 5/5 real calls, all first-attempt schema-valid, dial 1.5–2.1s)
- **Answer evaluation: FAILED deterministically** (Gate 4; see §6)
- **Test suite baseline preserved:** 99 tests, 94 pass / 5 fail (the 5 fails are the pre-existing legacy git-state tests, unchanged from the migration baseline)
- **No secrets printed, logged, or shipped.** API key verified masked-only; security boundary untouched.

## 2. Scope & Constraints

- Gemini migration: untouched (docs 01/02/05/07, ai.js, resume.model.js, m5.1 test, orchestration contract).
- Contract-legal envelope enforced: no prompt rewrites, no schema-injection timing change, no adapter-side schema pinning, no retry/timeout policy change, preferred model `openai/gpt-oss-20b`, zero new dependencies (global `fetch`).

## 3. Architecture (Files Changed)

| File | Change |
|---|---|
| `server/src/ai/providers/groq.js` (NEW) | Groq adapter: single POST to `api.groq.com/openai/v1/chat/completions`; `json_object` mode; `AbortSignal.timeout(AI_CONFIG.timeoutMs)`; 429→`retryable:true`; returns `{ text, latencyMs, tokenUsage }`; never logs keys |
| `server/src/ai/orchestrator.js` | Provider selection via `AI_PROVIDER` env (default `gemini`, static import preserved → provider-isolation test still passes); provenance recorded from adapter `NAME`/`MODEL` |
| `server/src/ai/providers/gemini.js` | Added identity exports `NAME`, `MODEL` (behavior unchanged) |
| `server/src/config/env.js` | Optional declarations: `AI_PROVIDER`, `GROQ_API_KEY`, `GROQ_MODEL` |

## 4. Verification

- `npm test`: 99 tests, 94 pass, 5 fail (legacy git-state only — M5.2-11, M5.3-15, M5.4-14, M5.5-12, M5.6-19 — identical to pre-experiment baseline).
- One regression was caught and fixed during the experiment (provider-isolation test after the first orchestrator edit) — final suite runs green at baseline.

## 5. Gate Outcomes

### Gate 1 — Direct smoke (adapter only, real production prompt)

| Run | Result | latencyMs | tokens (in/out) | output |
|---|---|---|---|---|
| 1 | ✅ | 2072 | 428 / 1518 | 1793 chars, JSON-shaped questions |

### Gate 2 — Real orchestrator run (in-memory Mongoose replica set, audit persisted)

| Result | latencyMs | attempts | corrections | audit |
|---|---|---|---|---|
| ✅ | 1988 | 1 | 0 | persisted: `provider=groq, model=openai/gpt-oss-20b, status=SUCCESS` |

### Gate 3 — Three real runs (one per difficulty)

| difficulty | Result | latencyMs | attempts | corrections | categories |
|---|---|---|---|---|---|
| easy | ✅ | 1780 | 1 | 0 | database, system-design, api-design |
| medium | ✅ | 1566 | 1 | 0 | system-design, database, concurrency |
| hard | ✅ | 1802 | 1 | 0 | system-design, database, concurrency |

### Gate 4 — Full pipeline (question generation + answer evaluation)

| Phase | Result |
|---|---|
| question generation | ✅ (as Gates 1–3) |
| answer evaluation | ❌ `SCHEMA_VALIDATION_FAILED`, attempts=2 (initial + contract-correct correction retry), both invalid |

## 6. Root-Cause Analysis (Gate 4) — Evidence-First

Both prompts (question-gen and answer-eval) contain the literal placeholder line `Return a JSON object with this exact shape: { schema }`. The placeholder is replaced by the schema **only** in the correction retry — the contract-documented injection path (docs/07).

**Probe A — initial prompt, plain mode:** 2/2 runs returned `{ "schema": {...} }` — the model honors the literal `{ schema }` text as a top-level template key. Gemini glosses over the placeholder; `gpt-oss-20b` mirrors it. (Same nesting observed in `json_object` mode: Gate-4 attempt 1.)

**Probe B — correction prompt with real schema appended:** 3/3 runs returned the correct top-level 7-key shape, but every run produced `topicAssessments[].skillKey = "mongodb: schema design"` — copying the prompt's `skillKey: topic` serialization format verbatim. The Zod gate rejects it (expected key: `mongodb`). This is 100% reproducible: the contract-correct retry path never succeeds, so the app-side gate (which exists precisely to catch this class of drift) correctly rejects the operation.

## 7. Conclusion

- **Question generation** through Groq is functional within the contract (structured-adherent output, fast, zero corrections in 5 real calls).
- **Answer evaluation** is incompatible with `openai/gpt-oss-20b` under the current prompt contract: the placeholder template is interpreted literally (attempt 1) and the `skillKey: topic` inline format is misparsed (attempt 2). No contract-legal remediation exists (no prompt rewrite, no per-operation adapter schema, no injection-timing change); any fix would alter the comigration-frozen contract.
- **Recommendation:** do NOT switch providers. Destroy or archive the experiment (`groq.js`, env declarations, `AI_PROVIDER` selection) at cleanup time; the Gemini migration remains the production path. Attempting another Groq model via `GROQ_MODEL` (user-driven) is the only listed follow-up option.

## 8. Operational Notes

- `GROQ_API_KEY` was added to `server/.env` by the user (variable initially landed as `GORQ_API_KEY` — typo fixed, value untouched). Key never printed or logged; adapter failure paths carry no key material.
- Gate scripts ran from the OS temp dir; no artifacts left in the working tree beyond the 4 experiment-file changes listed in §3.