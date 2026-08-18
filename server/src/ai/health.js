// In-process provider/model health state (M5.7 AI failover milestone). Purpose:
// after a quota-exhaustion or rate-limit failure, stop selecting that
// (provider, model) pair for a cooldown window so other in-flight requests
// don't pile onto an exhausted candidate (docs/16-ai-failover.md §Health).
//
// Deliberately NOT persisted (no MongoDB, no Redis, no disk): a server restart
// forgets every cooldown — an accepted MVP trade-off, documented in
// docs/16-ai-failover.md (§Health, §Concurrency). Multiple Node processes /
// horizontal scaling are NOT coordinated: each process runs its own view, so a
// cooldown marked in one process does not stop selection in another. Cooldown
// expiry is the natural recovery path: when the window ends the candidate
// re-enters rotation and probes the provider again (a time-based circuit
// break; a full failure-count circuit breaker is explicitly deferred).
//
// All reads/writes are synchronous (no await between read and write), so state
// transitions are atomic within a single Node process — there is no
// read-modify-write race between concurrent requests.
const { AI_CONFIG } = require('../config/ai');

// key: "provider||model" → { quotaExhaustedUntil, rateLimitedUntil }
const state = new Map();

function stateKey(provider, model) {
  return `${provider}||${model}`;
}

// Cooldown durations are read from AI_CONFIG at mark time (not captured at
// module load) so tests can tune them without reloading modules.
function markQuotaExhausted(provider, model, now = Date.now()) {
  const key = stateKey(provider, model);
  const entry = state.get(key) ?? {};
  entry.quotaExhaustedUntil = now + AI_CONFIG.quotaCooldownMs;
  state.set(key, entry);
}

function markRateLimited(provider, model, now = Date.now()) {
  const key = stateKey(provider, model);
  const entry = state.get(key) ?? {};
  entry.rateLimitedUntil = now + AI_CONFIG.rateLimitCooldownMs;
  state.set(key, entry);
}

function isAvailable(provider, model, now = Date.now()) {
  const entry = state.get(stateKey(provider, model));
  if (!entry) return true;
  if (typeof entry.quotaExhaustedUntil === 'number' && now < entry.quotaExhaustedUntil) return false;
  if (typeof entry.rateLimitedUntil === 'number' && now < entry.rateLimitedUntil) return false;
  return true;
}

// Test/ops hook: forget every cooldown.
function reset() {
  state.clear();
}

module.exports = { markQuotaExhausted, markRateLimited, isAvailable, reset };