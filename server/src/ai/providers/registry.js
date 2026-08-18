// Provider registry (M5.7 AI failover milestone). The orchestrator's only
// source of provider/model candidates. Builds the ordered candidate chain
// from configuration (docs/16-ai-failover.md §Provider registry):
//
//   AI_PROVIDER_CHAIN order (first = primary provider)
//     → per-provider model order (AI_<PROVIDER>_MODELS) — same-provider
//       failover ALWAYS precedes cross-provider failover
//     → capability filter (provider must be approved for the operation —
//       docs/15 Groq evidence: availability ≠ contract compatibility)
//     → configuration validity (API key present, models configured —
//       unconfigured fallback providers are skipped silently)
//     → health state (in-process cooldown — an exhausted candidate is skipped)
//
// The unit of selection is the (provider, model, adapter) candidate — never a
// provider name alone. Adding a provider = one adapter file in providers/ +
// env entries (key + models + capabilities); nothing in the orchestrator or
// registry logic changes.
//
// Key PRESENCE is checked against process.env at call time (not captured at
// load) so tests can toggle provider availability per invocation. The key
// VALUE itself is only ever used inside the adapters and is never exposed
// here, logged, or persisted.
const { AI_CONFIG } = require('../../config/ai');
const health = require('../health');

const geminiAdapter = require('./gemini');
const groqAdapter = require('./groq');

const PROVIDER_ADAPTERS = {
  gemini: geminiAdapter,
  groq: groqAdapter,
};

// Build the full ordered candidate list for the configured chain. Candidates
// for a provider are skipped when the provider has no adapter, no configured
// API key, or no configured models.
function buildCandidates() {
  const candidates = [];
  for (const providerName of AI_CONFIG.providerChain) {
    const providerConfig = AI_CONFIG.providers[providerName];
    const adapter = PROVIDER_ADAPTERS[providerName];
    if (!providerConfig || !adapter) continue;
    if (!process.env[providerConfig.keyVar]) continue; // unconfigured fallback provider
    for (const model of providerConfig.models) {
      candidates.push({ provider: providerName, model, adapter });
    }
  }
  return candidates;
}

// Eligible candidates for one AI operation: configured chain ∩ operation
// capability approval ∩ healthy (not in cooldown).
function getCandidates(operation) {
  const candidates = [];
  for (const candidate of buildCandidates()) {
    const capabilities = AI_CONFIG.providers[candidate.provider].capabilities;
    if (!capabilities.includes(operation)) continue;
    if (!health.isAvailable(candidate.provider, candidate.model)) continue;
    candidates.push(candidate);
  }
  return candidates;
}

module.exports = { getCandidates, buildCandidates, PROVIDER_ADAPTERS };