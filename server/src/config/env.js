const dotenv = require('dotenv');

// Load .env before reading any environment variables.
dotenv.config({ quiet: true });

// Required at startup — missing any of these fails fast with a clear error.
// JWT_ACCESS_SECRET became required from M3 (authentication is active).
const REQUIRED_AT_STARTUP = ['MONGO_URI', 'PORT', 'CLIENT_ORIGIN', 'JWT_ACCESS_SECRET'];

const missing = REQUIRED_AT_STARTUP.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and set these values before starting.');
  process.exit(1);
}

module.exports = {
  MONGO_URI: process.env.MONGO_URI,
  PORT: Number(process.env.PORT),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,

  // JWT_ACCESS_SECRET is required from M3 (in REQUIRED_AT_STARTUP above) and is
  // the only secret-backed var today — never defaulted, no legacy JWT_SECRET.
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,

  // Declared so later phases have a stable import, but NOT required at startup.
  // Each future module's own config layer is responsible for failing clearly
  // when its variable is missing — not env.js globally today.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY, // required from M5 (AI)
  SUPABASE_URL: process.env.SUPABASE_URL, // required from M6 (storage)
  SUPABASE_KEY: process.env.SUPABASE_KEY, // required from M6 (storage)
  SUPABASE_BUCKET: process.env.SUPABASE_BUCKET, // required from M6 (storage)

  // M5.7 AI provider chain (failover) — all optional; config/ai.js computes
  // the effective defaults (chain = ["gemini"], etc.). AI_PROVIDER_CHAIN
  // orders providers by priority (first = primary). AI_<PROVIDER>_MODELS is
  // a comma-separated list of same-provider alternate models (same-provider
  // failover precedes cross-provider failover — docs/16-ai-failover.md).
  // AI_<PROVIDER>_CAPABILITIES is the evidence gate: a provider supports only
  // the operations explicitly listed here (Groq's default is NONE — see
  // docs/15); Gemini's three operations are the M5-verified production
  // contracts by default. GROQ_API_KEY is required only when groq is part of
  // the chain.
  AI_PROVIDER_CHAIN: process.env.AI_PROVIDER_CHAIN,
  AI_GEMINI_MODELS: process.env.AI_GEMINI_MODELS,
  AI_GROQ_MODELS: process.env.AI_GROQ_MODELS,
  AI_GROQ_CAPABILITIES: process.env.AI_GROQ_CAPABILITIES,
  AI_FAILOVER_ENABLED: process.env.AI_FAILOVER_ENABLED,
  AI_MAX_TOTAL_ATTEMPTS: process.env.AI_MAX_TOTAL_ATTEMPTS,
  AI_QUOTA_COOLDOWN_MS: process.env.AI_QUOTA_COOLDOWN_MS,
  AI_RATE_LIMIT_COOLDOWN_MS: process.env.AI_RATE_LIMIT_COOLDOWN_MS,

  GROQ_API_KEY: process.env.GROQ_API_KEY,
};
