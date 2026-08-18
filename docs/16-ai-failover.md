# PrepVerse — Design 16: AI Provider Failover (M5.7)

Status: **implemented and verified by the M5.7 test suite** (`server/tests/m5.7-ai-failover.test.js`). Milestone M5.7 CLOSED.

## 0. Scope and authority

M5.7 delivers the multi-provider failover pipeline that Design 1 §1.5 explicitly deferred ("Multi-provider LLM routing — architecture supports it"). It is an **availability** mechanism for `server/src/ai/`: the Gemini primary provider is preserved exactly, alternate Gemini models and an optional Groq fallback are served through the existing orchestrator pipeline with **no API, schema, or domain-state changes**.

Authority chain: docs/01 §1.5 (amended) → docs/02 §2.4 (amended) → docs/07 §5 (amended) → this document. This document is the normative M5.7 contract; the three amendments are pointer + behavior-summary updates.

Out of scope, stated and not silently skipped:

- **Circuit breaker** (open/closed states) — deferred; the M5.7 cooldown store is a coarsened approximation with a documented boundary (§6).
- **Adaptive/probabilistic probing** of providers ("canary" requests) — deferred.
- **Cross-provider idempotent golden retry** of a completed correction — the correction retry stays same-candidate (§5).
- **Any queue/worker** — the pipeline remains synchronous per docs/02 §2.3.
- **API contract changes** — none; clients see the same typed `AIProviderError` (502) shape with the same codes plus new availability-specific codes below.

## 1. Goals and non-goals

Goals:

1. A Gemini outage, quota exhaustion, or rate limit (exhausted after the preserved backoff) does not hard-fail the interview/resume operation when a configured fallback exists.
2. Failover is **configuration-driven**: a deployment that sets nothing becomes byte-for-byte pre-M5.7 behavior.
3. Every attempt leaves an audit trail reconstructible as a chain: `candidate → category → next candidate`.
4. Total AI spend per operation stays bounded (attempt budget), and per-call latency stays bounded (per-call timeout).

Non-goals:

- **Hiding contract bugs.** A schema failure, a 400-class invalid request, an auth misconfiguration, or an ambiguous/unclassifiable error NEVER triggers a provider switch — switching would silently mask a shared prompt/schema/credential defect (docs/07 §5, AGENTS.md rule 2).
- **Increasing output quality.** Groq fallback serves the same prompts/schemas; capability gating (§3) restricts *which* operations a fallback may serve.
- **Persisting provider state.** Health state is in-process memory (§6); a crash loses cooldowns.

## 2. Provider & model registry

`server/src/ai/providers/registry.js` is the single holder of provider adapters; `server/src/config/ai.js` + `server/src/config/env.js` hold configuration.

| Concept | Definition |
|---|---|
| Provider spec | `PROVIDER_SPECS`: name → `{ apiKeyVar, defaultModels, defaultCapabilities }`. Gemini: `GEMINI_API_KEY`, `['gemini-3.6-flash']`, ALL operations. Groq: `GROQ_API_KEY`, `['openai/gpt-oss-20b']`, **no operations by default** (docs/15 evidence: QG PASS, AE FAIL on contract). |
| Chain | `AI_PROVIDER_CHAIN` — ordered comma-separated provider names, default `gemini`. Unknown names → startup warning + skip (never a crash). |
| Live key check | A provider participates in a candidate chain **at call time** only if `process.env[apiKeyVar]` is set. Keys are never stored in config state. |
| Boot requirement | The **primary** provider's key (`GEMINI_API_KEY`) is still required at boot (pre-M5.7 behavior retained). Fallback keys are optional. |
| Models | `AI_GEMINI_MODELS` / `AI_GROQ_MODELS` — ordered comma-separated, defaulting to the spec defaults. Same-provider alternates are tried before any cross-provider move (docs/15 keys §4). |
| Capabilities | `AI_GROQ_CAPABILITIES` — comma-separated subset of `RESUME_ANALYSIS`, `QUESTION_GENERATION`, `ANSWER_EVALUATION`. Candidate selection filters by operation (`getCandidates(operation)`). Gemini's `AI_GEMINI_CAPABILITIES` is intentionally absent — Gemini is the contract-verified provider for all three operations. |

Candidate ordering rule: `for provider in chain: for model in provider.models: [provider, model]`, filtered by (a) key present, (b) operation capability, (c) health availability (§6). `getCandidates()` returns this ordered list; `AI_FAILOVER_ENABLED=false` collapses it to the first entry.

## 3. Operation capability matrix

| Operation | Gemini (default) | Groq (explicit opt-in) |
|---|---|---|
| RESUME_ANALYSIS | yes | yes, if in `AI_GROQ_CAPABILITIES` |
| QUESTION_GENERATION | yes | yes, if in `AI_GROQ_CAPABILITIES` |
| ANSWER_EVALUATION | yes | yes, if in `AI_GROQ_CAPABILITIES` |

Groq's capability gate defaults to **empty** because docs/15 empirically showed answer-evaluation violating the contract (final scores outside the closed interval) even under the v2 prompt. Question generation passed. Reserving capability assignment to explicit configuration is the conservative default.

## 4. Failure taxonomy

`server/src/ai/providers/classify.js` owns classification. Sources:

- **Gemini SDK errors** → `classifyGeminiError`, duck-typed on error `name`/`message` (no import of `@google/generative-ai` outside `providers/gemini.js`): quota → `QUOTA_EXHAUSTED`, 429/rate-limit → `RATE_LIMITED`, 5xx/network → `PROVIDER_UNAVAILABLE`, auth/`UNAUTHENTICATED` → `AUTHENTICATION_FAILED`, 400-class → `INVALID_REQUEST`, else `UNKNOWN`.
- **Groq HTTP failures** → `classifyHttpFailure` by `{ status, message, details }` upstream payload: `429` + no quota reason → `RATE_LIMITED`; `429` with upstream `QUOTA_EXHAUSTED` reason → `QUOTA_EXHAUSTED`; `5xx`/`503` → `PROVIDER_UNAVAILABLE`; `401`/`403` → `AUTHENTICATION_FAILED`; other 4xx → `INVALID_REQUEST`.
- **Transport throws** (`fetch`, `AbortSignal.timeout`, DNS) → `classifyFetchThrow`: `AbortError` → `TIMEOUT`, others → `PROVIDER_UNAVAILABLE`.

Mapping to the client-visible `AIProviderError.details.failure` (502, unchanged mechanism):

| Category | errorCode (`details.failure`) | Failover-eligible |
|---|---|---|
| `RATE_LIMITED` | `RATE_LIMITED` | yes (after backoff budget) |
| `QUOTA_EXHAUSTED` | `QUOTA_EXHAUSTED` | yes (immediately) |
| `PROVIDER_UNAVAILABLE` | `AI_PROVIDER_FAILED` | yes (immediately) |
| `TIMEOUT` | `TIMEOUT` | yes (immediately) |
| `AUTHENTICATION_FAILED` | `AUTHENTICATION_FAILED` | **no** |
| `INVALID_REQUEST` | `AI_PROVIDER_FAILED` | **no** |
| `UNKNOWN` | `AI_PROVIDER_FAILED` | **no** |
| — (orchestrator) | `SCHEMA_VALIDATION_FAILED` | **no** (correction path, docs/07 §5) |
| — (orchestrator) | `NO_ELIGIBLE_PROVIDER` | n/a (nothing left to try) |

`isFailoverEligible()` is the single gate used for every branch — no domain service or controller ever decides failover.

## 5. Retry vs. failover policy

Preserved unchanged from docs/07 §5 / M5.1 (must not regress — pinned by m5.1 tests B1/B3/C/D):

- `429 RATE_LIMITED`: backoff `1s, 2s, 4s`, max **3 attempts on the same candidate**; only after that budget is spent does the operation fail over.
- Malformed JSON / schema failure: one correction retry on the **same candidate**; second failure → `SCHEMA_VALIDATION_FAILED` hard failure. Never a provider switch (§1 non-goal).
- Non-retryable immediate failure → 1 attempt, typed throw (B4).

M5.7 additions:

- `QUOTA_EXHAUSTED` → **no backoff** — quota is not transient latency; fail over immediately.
- `PROVIDER_UNAVAILABLE` / `TIMEOUT` → fail over immediately (no backoff on the dead candidate).
- After the same-candidate budget is spent, the candidate is marked in the health store (§6) and the next candidate in the ordered chain is tried, carrying the chain-link provenance (§7).
- **`AI_MAX_TOTAL_ATTEMPTS` (default 4, allowed 1–10) is a hard cap across ALL candidates — every provider call, including 429 backoff attempts and correction attempts.** A spent budget ends the operation with a typed final failure even if candidates remain. This is the latency/cost bound: worst-case wall time ≈ `maxTotalAttempts × timeoutMs`.
- If the whole chain fails → final `AIProviderError` whose `details.failure` is the errorCode of the **final candidate's category** (`candidatesTried` in `details`).
- No candidates at all (all filtered: keys missing, capabilities absent, cooldown) → `NO_ELIGIBLE_PROVIDER`, logged once, thrown immediately — never a silent wait.

When `AI_FAILOVER_ENABLED=false`, the operation uses exactly one candidate: 429 backoff, correction, immediate-failure, and budget semantics are byte-identical to pre-M5.7 (proven by regression: the m5.1 suite runs on the default environment and passes).

## 6. In-process health & cooldown store

`server/src/ai/health.js` — a `Map<"provider/model", {quotaExhaustedUntil?, rateLimitedUntil?}>`, mutated synchronously, read at candidacy-build time via `isAvailable()`.

| Event | Cooldown | Default | Config key |
|---|---|---|---|
| `QUOTA_EXHAUSTED` | quota exhaustion | 1 h | `AI_QUOTA_COOLDOWN_MS` |
| `RATE_LIMITED` (budget spent) | rate-limit | 30 s | `AI_RATE_LIMIT_COOLDOWN_MS` |

Rules:

1. Marks happen only on **failover-eligible** failures, and only when **a fallback candidate actually exists** in the chain (chain length > 1). A single-provider deployment never marks — otherwise B3-style rate-limit exhaustion would blind the only route and produce `NO_ELIGIBLE_PROVIDER` fast-fails instead of the preserved retry behavior.
2. The failing request itself does NOT wait for cooldowns — it moves to the next candidate immediately. Cooldowns protect *other* in-flight requests from re-selecting an exhausted candidate (herd avoidance).
3. No persistence, no cross-instance distribution, no circuit-breaker semantics (documented limitation). `reset()` exists for tests.

## 7. Chain-link audit trail (AIExecution, per-attempt)

docs/05 §6 already specifies **"one document per AI call"**. M5.7 adds three optional fields to `AIExecution`:

| Field | Meaning |
|---|---|
| `attempt` | 1-based ordinal across the whole operation |
| `fallbackFrom` | `"provider/model"` label of the candidate this attempt **came from** (the chain link), null if none |
| `fallbackReason` | the category that marked the previous candidate, null if none |

Every attempt — success, intermediate failure, final failure, contract failure — persists its own row before the operation returns (per-attempt rows are fire-and-forget inside the retry loop for fake-timer compatibility; terminal rows are awaited). A failover chain therefore leaves a reconstructible sequence: `gemini/gemini-3.6-flash (RATE_LIMITED) → gemini/gemini-3.6-flash-b (QUOTA_EXHAUSTED) → groq/openai/gpt-oss-20b (SUCCESS)`.

Sanitization contract unchanged (docs/06 §4.3, AGENTS.md rule 8): `outputSummary` only, on every row.

## 8. Configuration reference

| Env var | Default | Meaning |
|---|---|---|
| `AI_PROVIDER_CHAIN` | `gemini` | ordered provider names |
| `AI_GEMINI_MODELS` | `gemini-3.6-flash` | ordered fallback models |
| `AI_GROQ_MODELS` | `openai/gpt-oss-20b` | ordered Groq models |
| `AI_GROQ_CAPABILITIES` | (none) | operations Groq may serve |
| `AI_FAILOVER_ENABLED` | `true` | `false` → first candidate only |
| `AI_MAX_TOTAL_ATTEMPTS` | `4` | hard attempt budget (1–10, outside → clamped with warning) |
| `AI_QUOTA_COOLDOWN_MS` | `3600000` | quota cooldown |
| `AI_RATE_LIMIT_COOLDOWN_MS` | `30000` | rate-limit cooldown |
| `GROQ_API_KEY` | (unset) | fallback key, required only when Groq is in the chain |

Unset/over-long chain strings, non-numeric cooldowns, etc. fall back to defaults with a startup warning; only the **primary** provider's key absence is fatal (pre-M5.7 boot behavior).

## 9. Concurrency semantics

- Every operation is **at-least-once** (unchanged from M5.1): a retried attempt may have succeeded upstream without the client seeing it.
- Audit rows are observational — domain state transitions remain governed by the M5.3/M5.4 CAS gates, unaffected by per-attempt rows.
- Health mutations are synchronous and lock-free (single-threaded JS); no awaits between `isAvailable()` read and candidate selection.
- **Herd behavior on cooldown switch** is accepted and documented: concurrent requests that saw an exhausted candidate all move to the next candidate together; single-flight dedup of fallback calls is deferred (no queue/worker, docs/02 §2.3).

## 10. Security invariants (unchanged + new)

- No API key in any persisted/logged object; keys are read from `process.env` per candidate selection (AGENTS.md rule 1 spirit).
- Provider error payloads are classified into categories only — upstream bodies are never persisted or surfaced to clients.
- `AIExecution` sanitization unchanged (rule 8).
- No new endpoints, no new user-controllable inputs.

## 11. Testing contract

- New suite `server/tests/m5.7-ai-failover.test.js`: registry ordering/capability/key filtering, classification matrix (unit), orchestrator chain behavior (same-provider alternates, cross-provider move, no-switch classes, budget bound, provenance rows, cooldown gating with real concurrency), `AI_FAILOVER_ENABLED=false` collapse, NO_ELIGIBLE_PROVIDER.
- Regression: the full `npm test` suite must match the pre-M5.7 baseline modulo the expectable git-state guards (5 tests asserting clean-tree/commit-history, failing only because M5.7 work is uncommitted — they pass after the milestone commit, same as every prior milestone).
- No real provider calls in CI — mocks route by `(adapter, model)`; real-provider verification is an environment-limited manual step (do not spend quota).

## 12. Rollback path

Delete `AI_PROVIDER_CHAIN`/`AI_GROQ_*`/`AI_FAILOVER_ENABLED`/`AI_MAX_TOTAL_ATTEMPTS` overrides: defaults reproduce single-Gemini behavior exactly; the regression suite is the proof. The M5.7 files (`registry.js`, `classify.js`, `health.js`) are additive; `orchestrator.js` behavior under a one-candidate chain is covered by the untouched m5.1 B/C/D/F/G tests.