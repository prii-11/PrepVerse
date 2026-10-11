// Azure Document Intelligence client — plain fetch, M6.1 extraction fallback
// (docs/21 §6-8). The ONLY module that speaks DI transport; mirrors the
// storage.client.js posture (plain fetch, no SDK — groq.js "no SDK
// dependency" precedent) and the providers/ isolation pattern: DI knowledge
// stays inside the extraction boundary, resumeAnalyzer/orchestrator/M5.7 are
// untouched.
//
// Role: DOCUMENT EXTRACTION only. It deliberately does not touch MongoDB,
// AIExecution, the AI candidate registry, health state, or any M5.7
// mechanism (docs/21 §18). Failures surface as AzureDiError with a small
// extraction-specific category; textExtractor maps that to the existing
// ResumeTextExtractionError, so the public failure taxonomy is unchanged.
//
// Input: a server-generated short-lived signed URL to the PRIVATE resume
// object (docs/21 §6) — the backend hands Azure the capability, never bytes
// through the backend, and never the user-facing download URL.
//
// Bounded behavior (docs/21 §8): ONE analyze submission, then a bounded poll
// loop under DI_CONFIG.timeoutMs. No retry, no backoff, no cooldown, no
// circuit breaker, no persistent health state — the two-extractor
// `local → azure → fail` chain is sufficient for this milestone.
const { DI_CONFIG } = require('../config/di');

// DI-specific failure with an internal category — NOT an AppError: the
// frontend contract keeps only RESUME_TEXT_EXTRACTION_FAILED (docs/21 §7).
class AzureDiError extends Error {
  constructor(category, message, options = {}) {
    super(message);
    this.name = 'AzureDiError';
    this.category = category;
    this.upstreamStatus = options.upstreamStatus ?? null;
  }
}

// Classifies a non-2xx analyze/poll response. Deliberately a smaller taxonomy
// than M5.7's classify.js: DI failures that mean "extraction can't happen"
// all funnel into the existing ResumeTextExtractionError at the boundary.
function classifyDiFailure(status) {
  if (status === 401 || status === 403) {
    return new AzureDiError('AUTHENTICATION_FAILED', `Document Intelligence rejected credentials (HTTP ${status})`, { upstreamStatus: status });
  }
  if (status === 429) {
    return new AzureDiError('RATE_LIMITED', 'Document Intelligence rate limit exceeded', { upstreamStatus: status });
  }
  if (status >= 500) {
    return new AzureDiError('PROVIDER_UNAVAILABLE', 'Document Intelligence service unavailable', { upstreamStatus: status });
  }
  // 400-class invalid request (bad model name, malformed body, unsupported/
  // corrupt document). Corrupt input is rejected here by Azure too — that is
  // an input/document failure and simply funnels to the existing FAILED
  // semantics; we do NOT retry or refine (docs/21 §6-7).
  return new AzureDiError('INVALID_REQUEST', `Document Intelligence rejected the request (HTTP ${status})`, { upstreamStatus: status });
}

function wrapTransportError(error) {
  const isTimeout = error?.name === 'TimeoutError' || error?.name === 'AbortError';
  if (isTimeout) {
    return new AzureDiError('TIMEOUT', 'Document Intelligence request timed out');
  }
  return new AzureDiError('PROVIDER_UNAVAILABLE', `Document Intelligence request failed: ${error?.message ?? 'network error'}`);
}

async function parseJson(response) {
  const text = await response.text().catch(() => null);
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function diRequest(url, { method = 'GET', body } = {}) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        'Ocp-Apim-Subscription-Key': DI_CONFIG.apiKey,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(DI_CONFIG.requestTimeoutMs),
    });
  } catch (error) {
    throw wrapTransportError(error);
  }
  const parsed = await parseJson(response);
  if (!response.ok) {
    throw classifyDiFailure(response.status);
  }
  return { response, parsed };
}

function analyzeEndpoint() {
  return `${DI_CONFIG.endpoint}/documentintelligence/documentModels/${DI_CONFIG.model}:analyze?api-version=${DI_CONFIG.apiVersion}`;
}

// Azure DI result → plain text in the ResumeAnalyzer contract. prebuilt-read
// returns `analyzeResult.content` (reading order, newline separated);
// paragraphs join is the fallback for envelopes without content. Raw
// extracted text stays transient — returned to the caller, never persisted,
// never logged (docs/21 §11-12).
function normalizeResult(parsed) {
  const analyzeResult = parsed?.analyzeResult;
  const content = analyzeResult?.content;
  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }
  const paragraphs = Array.isArray(analyzeResult?.paragraphs)
    ? analyzeResult.paragraphs.map((p) => typeof p?.content === 'string' ? p.content.trim() : '').filter((c) => c.length > 0)
    : [];
  const joined = paragraphs.join('\n').trim();
  if (joined.length > 0) {
    return joined;
  }
  throw new AzureDiError('EMPTY_RESULT', 'Document Intelligence returned no readable text');
}

// Submits the private document (by signed URL) for extraction, polls the
// operation to completion, and returns normalized plain text.
//
// DI REST contract (api-version 2024-11-30): the analyze POST returns 202
// with an Operation-Location header; polling that URL yields { status } with
// 'running'|'succeeded'|'failed', and the succeeded body carries the
// analyzeResult in the same response — no third URL hop.
//
// Throws AzureDiError on every DI-side failure (docs/21 §7): the caller's
// only job is to funnel that into RESUME_TEXT_EXTRACTION_FAILED.
async function extractDocument(documentUrl) {
  // The analyze POST replies 202 with the async operation URL in the
  // Operation-Location HTTP header (never a body URL on this contract).
  const { response: submitted } = await diRequest(analyzeEndpoint(), {
    method: 'POST',
    body: { urlSource: { url: documentUrl } },
  });
  const operationLocation = submitted?.headers?.get?.('operation-location');
  if (typeof operationLocation !== 'string' || operationLocation.length === 0) {
    throw new AzureDiError('INVALID_REQUEST', 'Document Intelligence response missing operation-location header');
  }

  const deadline = Date.now() + DI_CONFIG.timeoutMs;
  for (;;) {
    const { parsed: statusBody } = await diRequest(operationLocation);
    if (statusBody?.status === 'succeeded') {
      return normalizeResult(statusBody);
    }
    if (statusBody?.status === 'failed') {
      throw new AzureDiError('FAILED_OPERATION', 'Document Intelligence analysis failed');
    }
    if (Date.now() >= deadline) {
      throw new AzureDiError('TIMEOUT', `Document Intelligence analysis did not complete within ${DI_CONFIG.timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, DI_CONFIG.pollIntervalMs));
  }
}

module.exports = { extractDocument, AzureDiError, normalizeResult };