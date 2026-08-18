// AI provider configuration — docs/07, M5.1 §4, M5.7 (provider chain &
// failover). Centralized here following the config/scoring.js pattern; the
// actual provider SDK interaction lives ONLY in ai/providers/*.js, never in
// this file.
const env = require('./env');

const ALL_OPERATIONS = ['RESUME_ANALYSIS', 'QUESTION_GENERATION', 'ANSWER_EVALUATION'];

// Per-provider static defaults. Capability defaults are the evidence gate:
// Gemini's three operations are the M5-verified production contracts (default
// on); every other provider starts with NO approved operations and must be
// approved explicitly via AI_<PROVIDER>_CAPABILITIES once a provider
// experiment establishes contract compatibility (docs/15: Groq question
// generation PASSED, answer evaluation FAILED the tested contract — so Groq
// is capable-only-when-approved, never by default).
const PROVIDER_SPECS = {
  gemini: {
    keyVar: 'GEMINI_API_KEY',
    defaultModels: ['gemini-3.6-flash'],
    defaultCapabilities: ALL_OPERATIONS,
  },
  groq: {
    keyVar: 'GROQ_API_KEY',
    defaultModels: ['openai/gpt-oss-20b'],
    defaultCapabilities: [],
  },
};

function parseList(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const items = value.split(',').map((item) => item.trim()).filter(Boolean);
  return items.length > 0 ? items : fallback;
}

function parseIntInRange(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

// Chain from environment only, never hardcoded. Unknown provider names are
// logged and skipped — a typo in AI_PROVIDER_CHAIN must degrade to the
// configured providers, not fail the whole app.
const rawChain = parseList(env.AI_PROVIDER_CHAIN, ['gemini']);

const providers = {};
for (const name of rawChain) {
  const spec = PROVIDER_SPECS[name];
  if (!spec) {
    console.warn(`[ai-config] unknown provider '${name}' in AI_PROVIDER_CHAIN — skipped`);
    continue;
  }
  const upper = name.toUpperCase();
  providers[name] = {
    keyVar: spec.keyVar,
    models: parseList(env[`AI_${upper}_MODELS`], spec.defaultModels),
    capabilities: parseList(env[`AI_${upper}_CAPABILITIES`], spec.defaultCapabilities),
  };
}

// The PRIMARY provider's key is required — progress must never be made
// silently without the configured first-choice provider. Fallback provider
// keys are optional (an unconfigured fallback is skipped by the registry).
const primary = rawChain.find((name) => providers[name]);
if (primary) {
  const primarySpec = PROVIDER_SPECS[primary];
  const keyVar = primarySpec.keyVar;
  if (!env[keyVar]) {
    throw new Error(
      `${keyVar} is required because '${primary}' is the primary AI provider (set it in server/.env). Missing key — refusing to configure the AI layer.`
    );
  }
}

const AI_CONFIG = {
  // From environment only (env.js), never hardcoded in source.
  GEMINI_API_KEY: env.GEMINI_API_KEY,

  // Docs/07 specifies Gemini 3.6 Flash (free tier) as the provider model.
  // Primary Gemini default; overridable via AI_GEMINI_MODELS.
  model: 'gemini-3.6-flash',

  // Per-request timeout passed to the provider (ms). Proposed default —
  // keeps a hung upstream call from stalling the request forever.
  timeoutMs: 30000,

  // docs/07 §5 retry policy: 429 rate limit → backoff (1s, 2s, 4s), max 3
  // attempts ON THE SAME CANDIDATE. Only the first two delays are ever
  // consumed (maxAttempts = 3); the 4s slot is kept for fidelity to the
  // documented sequence. After the same-candidate budget is spent the M5.7
  // pipeline fails over to the next candidate.
  maxAttempts: 3,
  rateLimitRetryDelaysMs: [1000, 2000, 4000],

  // docs/07 §5: malformed JSON / schema validation failure → retry ONCE with a
  // correction prompt appended, then fail. Independent of the 429 budget:
  // schema failures allow at most 2 total AI attempts. Schema failures never
  // trigger provider failover (docs/16-ai-failover.md §Non-failover).
  maxCorrectionRetries: 1,

  // ---- M5.7 provider chain & failover -------------------------------------

  // Ordered provider names actually configured (unknown names filtered).
  providerChain: Object.keys(providers),

  // Per-provider { keyVar, models, capabilities } resolved from env.
  providers,

  // Master switch: false → the orchestrator uses only the FIRST configured
  // candidate (exactly the pre-M5.7 single-provider behavior).
  failoverEnabled: env.AI_FAILOVER_ENABLED !== 'false',

  // Hard bound on total provider calls per logical AI operation (across all
  // candidates and same-candidate retries) — cost and latency control; a
  // fallback chain always terminates. Default 4: enough for
  // primary + same-provider alternate + one fallback provider.
  maxTotalAttempts: parseIntInRange(env.AI_MAX_TOTAL_ATTEMPTS, 4, 1, 10),

  // How long a (provider, model) pair is skipped after a quota-exhaustion or
  // rate-limit failure (in-process health state, docs/16 §Health). Quota is
  // longer (daily plans don't reset in seconds); rate-limit is shorter so the
  // candidate re-enters rotation quickly.
  quotaCooldownMs: parseIntInRange(env.AI_QUOTA_COOLDOWN_MS, 60 * 60 * 1000, 0, 24 * 60 * 60 * 1000),
  rateLimitCooldownMs: parseIntInRange(env.AI_RATE_LIMIT_COOLDOWN_MS, 30 * 1000, 0, 60 * 60 * 1000),
};

module.exports = { AI_CONFIG };