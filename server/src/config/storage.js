// Object storage configuration — M6 (docs/17). Module-level fail-fast
// (D5-a): config/ai.js is the precedent — this config refuses to load when
// its own variables are missing, without touching env.js REQUIRED_AT_STARTUP
// (env.js:27-29 documents that contract for M6-era vars). SUPABASE_BUCKET
// is config-driven (D3-a), provisioned out-of-band in the Supabase dashboard
// (private bucket, docs/06 §3.3).
//
// The client module (src/storage/storage.client.js) is the ONLY place that
// speaks HTTP to Supabase — this file holds configuration, never transport
// (same rule as config/ai.js:3-4).
const env = require('./env');

// Placeholder guard, same convention as groq.js:32 — .env.example ships
// `your_...` placeholders that must be replaced with real values.
const required = ['SUPABASE_URL', 'SUPABASE_KEY', 'SUPABASE_BUCKET'];

const missing = required.filter((name) => {
  const value = env[name];
  return !value || /^your_/.test(value);
});

if (missing.length > 0) {
  throw new Error(
    `Storage configuration incomplete: ${missing.join(', ')} (set them to real values in server/.env — docs/17 §8 D3/D5).`
  );
}

const STORAGE_CONFIG = {
  // From environment only (env.js), never hardcoded in source.
  SUPABASE_URL: env.SUPABASE_URL, // e.g. https://<project-ref>.supabase.co
  SUPABASE_KEY: env.SUPABASE_KEY, // service role key — server-side only
  SUPABASE_BUCKET: env.SUPABASE_BUCKET, // private bucket; objects accessed only via signed URLs

  // Signed URL TTL (D2): 15 minutes, JWT parity — docs/06:48 documents the
  // token's "target ~15 minutes"; a signed URL is the same short-lived bearer
  // class. Constant, not env: mirrors config/ai.js timeoutMs precedent.
  signedUrlTtlSeconds: 15 * 60,

  // Per-request timeout for object storage (ms), mirroring groq.js:62's
  // AbortSignal.timeout(AI_CONFIG.timeoutMs) pattern.
  storageTimeoutMs: 15000,
};

module.exports = { STORAGE_CONFIG };