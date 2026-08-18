// Provider error classification (M5.7 AI failover milestone). Provider
// adapters translate provider-specific error surfaces (SDK classes, HTTP
// statuses, fetch throws) into a provider-neutral internal category carried on
// AIProviderError.details.category. The orchestrator decides retry vs
// failover from the category ONLY — it never inspects provider-specific error
// shapes (docs/16-ai-failover.md §Error taxonomy).
//
// Categories and their failover policy (PROVIDER FAILURE ≠ APPLICATION
// FAILURE — failover may only hide provider capacity/availability problems):
//
//   RATE_LIMITED          429 without a quota signal (temporary request limit)
//   QUOTA_EXHAUSTED       429 with a quota/exhaustion signal (daily plan
//                          exhausted) — immediate failover, no same-candidate
//                          backoff retry, longer cooldown
//   PROVIDER_UNAVAILABLE  HTTP 5xx, network failure, missing model (404),
//                          empty/undecipherable response body — transient
//                          provider-side availability, failover-eligible
//   TIMEOUT               request exceeded the per-attempt budget
//                          (failover-eligible; NOT same-candidate-retried —
//                          preserves the pre-existing non-429 patience policy)
//   AUTHENTICATION_FAILED 401/403 with a configured key — an application
//                          configuration defect; NEVER fail over (it would
//                          hide the defect)
//   INVALID_REQUEST       400-level caused by OUR request construction —
//                          never fail over
//   UNKNOWN               anything else — conservative: never fail over,
//                          never guess
//
// The errorCode mapping preserves the legacy docs/07 codes: RATE_LIMITED,
// SCHEMA_VALIDATION_FAILED and AI_PROVIDER_FAILED keep their exact meanings;
// new categories surface as new error codes (QUOTA_EXHAUSTED, TIMEOUT,
// AUTHENTICATION_FAILED, NO_ELIGIBLE_PROVIDER).

const CATEGORIES = {
  RATE_LIMITED: 'RATE_LIMITED',
  QUOTA_EXHAUSTED: 'QUOTA_EXHAUSTED',
  PROVIDER_UNAVAILABLE: 'PROVIDER_UNAVAILABLE',
  TIMEOUT: 'TIMEOUT',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  INVALID_REQUEST: 'INVALID_REQUEST',
  UNKNOWN: 'UNKNOWN',
};

// Failover eligibility: only provider capacity/availability categories may
// move the request to the next candidate. Everything else ends the operation
// immediately — the failure is our bug, not the provider's.
const FAILOVER_ELIGIBLE = new Set([
  CATEGORIES.RATE_LIMITED,
  CATEGORIES.QUOTA_EXHAUSTED,
  CATEGORIES.PROVIDER_UNAVAILABLE,
  CATEGORIES.TIMEOUT,
]);

// errorCode values surface in AIExecution.errorCode and in the domain
// failureReason fields (docs/05 §3/§4). Legacy codes preserved verbatim.
const ERROR_CODES = {
  [CATEGORIES.RATE_LIMITED]: 'RATE_LIMITED',
  [CATEGORIES.QUOTA_EXHAUSTED]: 'QUOTA_EXHAUSTED',
  // 5xx/404/network map onto the pre-existing generic code so the legacy
  // contract (details.failure === 'AI_PROVIDER_FAILED') is untouched.
  [CATEGORIES.PROVIDER_UNAVAILABLE]: 'AI_PROVIDER_FAILED',
  [CATEGORIES.TIMEOUT]: 'TIMEOUT',
  [CATEGORIES.AUTHENTICATION_FAILED]: 'AUTHENTICATION_FAILED',
  [CATEGORIES.INVALID_REQUEST]: 'AI_PROVIDER_FAILED',
  [CATEGORIES.UNKNOWN]: 'AI_PROVIDER_FAILED',
};

const SCHEMA_VALIDATION_FAILED = 'SCHEMA_VALIDATION_FAILED';
const NO_ELIGIBLE_PROVIDER = 'NO_ELIGIBLE_PROVIDER';

function isFailoverEligible(category) {
  return FAILOVER_ELIGIBLE.has(category);
}

function errorCodeFor(category) {
  return ERROR_CODES[category] ?? 'AI_PROVIDER_FAILED';
}

// Quota vs rate-limit heuristic on a 429. Both trigger failover; the
// difference matters for COOLDOWN duration and for whether the same candidate
// is worth an immediate retry. Gemini surfaces the authoritative signal in
// errorDetails[].reason / status ("RESOURCE_EXHAUSTED"); generic providers put
// quota wording in the message. A bare 429 defaults to RATE_LIMITED — the
// conservative reading of an ambiguous signal.
function hasQuotaSignal(message, details) {
  const reasons = Array.isArray(details)
    ? details
        .map((d) => typeof d?.reason === 'string' ? d.reason : '')
        .join(' ')
    : '';
  const haystack = `${reasons} ${Array.isArray(details) ? JSON.stringify(details).toLowerCase() : ''} ${message ?? ''}`.toLowerCase();
  if (haystack.includes('rate limit') || haystack.includes('rate_limit')) return false;
  return (
    haystack.includes('quota') ||
    haystack.includes('resource_exhausted') ||
    haystack.includes('resourceexhausted') ||
    haystack.includes('daily limit') ||
    haystack.includes('exhausted')
  );
}

// HTTP-status-driven classification shared by adapters that see real status
// codes. `status` may be null (network errors with no HTTP response).
function classifyHttpFailure({ status, message, details, statusText }) {
  const isQuota = (status === 429 || status === 403) && hasQuotaSignal(message, details);
  if (status === 429 || isQuota) return isQuota ? CATEGORIES.QUOTA_EXHAUSTED : CATEGORIES.RATE_LIMITED;
  if (status === 408) return CATEGORIES.TIMEOUT;
  if (status === 401 || status === 403) return CATEGORIES.AUTHENTICATION_FAILED;
  if (status === 404) return CATEGORIES.PROVIDER_UNAVAILABLE; // model/endpoint missing — availability, not our payload
  if (status >= 500 && status <= 599) return CATEGORIES.PROVIDER_UNAVAILABLE;
  if (status >= 400 && status <= 499) return CATEGORIES.INVALID_REQUEST;
  if (statusText && !status) return CATEGORIES.UNKNOWN;
  return CATEGORIES.UNKNOWN;
}

// fetch-level throws (adapters using global fetch — Groq). Node's
// AbortSignal.timeout rejects with a DOMException named 'TimeoutError' or
// 'AbortError'; a TypeError is the classic network-failure marker.
function classifyFetchThrow(error) {
  const name = error?.name;
  if (name === 'TimeoutError' || name === 'AbortError' || name === 'GoogleGenerativeAIAbortError') {
    return CATEGORIES.TIMEOUT;
  }
  if (name === 'TypeError' || error instanceof TypeError) return CATEGORIES.PROVIDER_UNAVAILABLE;
  return CATEGORIES.UNKNOWN;
}

// @google/generative-ai error surface (duck-typed by class name — this module
// must NOT import the SDK; providers/gemini.js is the sole SDK owner). A
// numeric status is ALWAYS authoritative when present — a blocked-response
// marker without a status stays UNKNOWN.
function classifyGeminiError(error) {
  if (!error) return CATEGORIES.UNKNOWN;
  const name = error.name;
  if (name === 'GoogleGenerativeAIAbortError') return CATEGORIES.TIMEOUT;
  if (name === 'GoogleGenerativeAIRequestInputError') return CATEGORIES.INVALID_REQUEST;
  if (typeof error.status === 'number') {
    // errorDetails is the SDK's parsed json.error.details (reason signals).
    return classifyHttpFailure({
      status: error.status,
      message: error.message,
      details: error.errorDetails,
      statusText: error.statusText,
    });
  }
  if (name === 'GoogleGenerativeAIResponseError') return CATEGORIES.UNKNOWN; // blocked response — not a capacity failure
  return CATEGORIES.UNKNOWN;
}

module.exports = {
  CATEGORIES,
  isFailoverEligible,
  errorCodeFor,
  classifyHttpFailure,
  classifyFetchThrow,
  classifyGeminiError,
  SCHEMA_VALIDATION_FAILED,
  NO_ELIGIBLE_PROVIDER,
};