// Groq provider adapter — experimental/fallback provider for the M5.7
// failover chain (docs/15 provider experiment, docs/16-ai-failover.md). NOT
// a production primary: Groq is eligible only for operations explicitly
// approved via AI_GROQ_CAPABILITIES (default: NONE — docs/15 established
// question generation PASSED, answer evaluation FAILED the tested contract).
//
// Mirrors the Gemini adapter's contract exactly:
//
//   generate(prompt, { model }) → { text, latencyMs, tokenUsage? }
//
// ONE provider call per generate(), raw text plus usage metadata, provider
// errors translated to AIProviderError with a provider-neutral
// `details.category` (providers/classify.js). It deliberately does NOT: write
// MongoDB, create AIExecution records, perform domain aggregation, implement
// retry loops, or validate schemas — the orchestrator owns all of those.
//
// Transport: Groq's OpenAI-compatible chat completions endpoint via global
// fetch (no SDK dependency). Structured outputs (JSON mode) are requested
// provider-side, but the application-side Zod gate remains authoritative —
// nothing here weakens or bypasses it.
const { AI_CONFIG } = require('../../config/ai');
const { AIProviderError } = require('../../utils/errors');
const { classifyHttpFailure, classifyFetchThrow } = require('./classify');

const NAME = 'groq';
// Default model id; the registry overrides per candidate via AI_GROQ_MODELS.
const MODEL = 'openai/gpt-oss-20b';
const ENDPOINT = 'https://api.groq.com/openai/v1/chat/completions';

function getApiKey() {
  const key = process.env.GROQ_API_KEY;
  if (!key || /^your_/.test(key)) {
    throw new AIProviderError('GROQ_API_KEY is missing (set it in server/.env)', {
      upstreamStatus: null,
      category: 'AUTHENTICATION_FAILED',
      retryable: false,
    });
  }
  return key;
}

async function generate(prompt, { model } = {}) {
  const startedAt = Date.now();
  let response;
  try {
    response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getApiKey()}`,
      },
      body: JSON.stringify({
        model: model || MODEL,
        messages: [{ role: 'user', content: prompt }],
        // JSON mode (operation-agnostic): enforces a valid JSON object
        // provider-side without pinning an operation-specific schema to a
        // multi-operation adapter. The application-side Zod gate in the
        // orchestrator remains the sole schema authority for every operation.
        response_format: { type: 'json_object' },
      }),
      // Same per-request budget as the Gemini adapter (ai.js timeoutMs).
      signal: AbortSignal.timeout(AI_CONFIG.timeoutMs),
    });
  } catch (error) {
    // Aborts (timeout) and network errors — normalized by the classifier.
    // Timeouts are failover-eligible but never same-candidate-retried,
    // matching the 429-only retry policy (docs/07 §5).
    const category = classifyFetchThrow(error);
    throw new AIProviderError('Groq provider request failed', {
      upstreamStatus: null,
      category,
      retryable: false,
    });
  }

  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const category = classifyHttpFailure({
      status: response.status,
      message: body?.error?.message ?? '',
      details: body?.error?.details,
    });
    throw new AIProviderError('Groq provider request failed', {
      upstreamStatus: response.status,
      category,
      retryable: category === 'RATE_LIMITED' || category === 'QUOTA_EXHAUSTED',
    });
  }

  if (!body || !Array.isArray(body.choices) || !body.choices[0]) {
    // 2xx but an undecipherable envelope — provider-side availability issue.
    throw new AIProviderError('Groq provider returned an empty response', {
      upstreamStatus: response.status,
      category: 'PROVIDER_UNAVAILABLE',
      retryable: false,
    });
  }

  const text = body.choices[0].message?.content;
  if (typeof text !== 'string' || text.length === 0) {
    throw new AIProviderError('Groq provider returned no content', {
      upstreamStatus: response.status,
      category: 'PROVIDER_UNAVAILABLE',
      retryable: false,
    });
  }

  const usage = body.usage;
  return {
    text,
    latencyMs: Date.now() - startedAt,
    tokenUsage:
      usage && typeof usage.prompt_tokens === 'number'
        ? { input: usage.prompt_tokens, output: usage.completion_tokens ?? 0 }
        : undefined,
  };
}

module.exports = { generate, NAME, MODEL };