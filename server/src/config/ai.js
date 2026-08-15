// AI provider configuration (Gemini 2.5 Flash) — docs/07, M5.1 §4.
// Centralized here following the config/scoring.js pattern; the actual Gemini
// SDK interaction lives ONLY in ai/providers/gemini.js, never in this file.
const env = require('./env');

// env.js declares GEMINI_API_KEY without requiring it at startup ("required
// from M5 (AI)"); per env.js's own convention, each module's config layer is
// responsible for failing clearly when its variable is missing — this is that
// failure point. Nothing in the boot path requires this file yet, so the
// server still starts without a key; it fails the moment the AI layer is used.
if (!env.GEMINI_API_KEY) {
  throw new Error(
    'GEMINI_API_KEY is required from M5 onward (set it in server/.env). Missing key — refusing to configure the AI layer.'
  );
}

const AI_CONFIG = {
  // From environment only (env.js), never hardcoded in source.
  GEMINI_API_KEY: env.GEMINI_API_KEY,

  // Docs/07 specifies Gemini 2.5 Flash (free tier) as the provider model.
  model: 'gemini-2.5-flash',

  // Per-request timeout passed to the Gemini SDK (ms). Proposed default —
  // keeps a hung upstream call from stalling the request forever.
  timeoutMs: 30000,

  // docs/07 §5 retry policy: 429 rate limit → backoff (1s, 2s, 4s), max 3
  // attempts. Only the first two delays are ever consumed (maxAttempts = 3);
  // the 4s slot is kept for fidelity to the documented sequence.
  maxAttempts: 3,
  rateLimitRetryDelaysMs: [1000, 2000, 4000],

  // docs/07 §5: malformed JSON / schema validation failure → retry ONCE with a
  // correction prompt appended, then fail. Independent of the 429 budget:
  // schema failures allow at most 2 total AI attempts.
  maxCorrectionRetries: 1,
};

module.exports = { AI_CONFIG };
