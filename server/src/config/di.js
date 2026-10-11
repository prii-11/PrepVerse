// Document Intelligence configuration — Azure DI extraction fallback (docs/21).
//
// OPTIONAL TIER, deliberately the inverse of config/storage.js (D5-a): DI is a
// fallback extractor behind the local pdf-parse/mammoth path, so a deployment
// that sets nothing must behave byte-for-byte like pre-DI M6. This module NEVER
// fails at require time while the feature is disabled; once AZURE_DI_ENABLED=true
// it fails fast (D5-a pattern) when its own variables are missing or still carry
// `your_...` placeholders (groq.js:32 convention) — an enabled-but-broken config
// must not silently ship.
//
// The transport lives in src/storage/azure.di.extractor.js — this file holds
// configuration, never HTTP (same rule as config/storage.js:8-10).
const env = require('./env');

const enabled = env.AZURE_DI_ENABLED === 'true';

// Placeholder guard, same convention as groq.js:32 / config/storage.js:15.
const required = ['AZURE_DI_ENDPOINT', 'AZURE_DI_KEY'];

if (enabled) {
  const missing = required.filter((name) => {
    const value = env[name];
    return !value || /^your_/.test(value);
  });
  if (missing.length > 0) {
    throw new Error(
      `Document Intelligence configuration incomplete: ${missing.join(', ')} (set them in server/.env — docs/21 §13).`
    );
  }
}

const DI_CONFIG = {
  // Only `true` enables the fallback; unset/false keeps extraction local-only.
  enabled,

  // <resource-name>.cognitiveservices.azure.com — endpoint as delivered by the
  // Azure portal, without a trailing slash.
  endpoint: enabled ? String(env.AZURE_DI_ENDPOINT).replace(/\/+$/, '') : null,
  // Subscription key (portal → Resource → Keys and Endpoint) — server-side
  // only, never logged, never exposed to the frontend.
  apiKey: env.AZURE_DI_KEY ?? null,

  // Azure DI built-in model. prebuilt-read is the whole requirement for now
  // (docs/21 §4): OCR of scanned/image-only PDFs into plain text. Layout's
  // tables/reading-order buy nothing for the plain-text ResumeAnalyzer
  // contract and cost ~6.7x more per page.
  model: env.AZURE_DI_MODEL || 'prebuilt-read',

  // GA API version (2024-11-30). Pinned, not env — same posture as
  // storage signedUrlTtlSeconds.
  apiVersion: '2024-11-30',

  // Whole-operation budget: analyze submission + poll loop. DI analyze is
  // async (202 + Operation-Location); this caps total wall time per fallback.
  timeoutMs: Number(env.AZURE_DI_TIMEOUT_MS) || 60000,

  // Poll interval for the operation status loop (code constant, not env —
  // mirrors storageTimeoutMs precedent).
  pollIntervalMs: 3000,

  // Per-request AbortSignal timeout for each HTTP call, mirroring
  // storage.client.js storageTimeoutMs (15s).
  requestTimeoutMs: 15000,
};

module.exports = { DI_CONFIG };