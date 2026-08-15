// Gemini provider adapter (M5.1 §5). This file is the ONLY place in the
// codebase that touches the Gemini SDK — an adapter around Gemini, nothing
// more. It takes a prompt, makes exactly ONE provider call, and returns the
// raw text plus usage metadata.
//
// It deliberately does NOT: write MongoDB, create AIExecution records, perform
// domain aggregation, update Resume/User/Interview, implement retry loops, or
// know about SkillProfileService/analytics/HTTP. Retry/backoff, JSON
// extraction, schema validation, and AIExecution logging all live in the
// orchestrator, which is the only caller of this module.
//
// Failures are surfaced as AIProviderError with `details.retryable`
// (true for upstream 429 — the only condition docs/07 §5 says to back off on;
// false for other provider/network errors). Deciding what to retry is the
// orchestrator's job, not this module's.
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AI_CONFIG } = require('../../config/ai');
const { AIProviderError } = require('../../utils/errors');

// Lazily constructed so requiring this module doesn't fail-fast the whole AI
// layer — but config/ai.js already refuses to load without a key, so if we
// get here the key exists.
let model = null;

function getModel() {
  if (!model) {
    const genAI = new GoogleGenerativeAI(AI_CONFIG.GEMINI_API_KEY);
    model = genAI.getGenerativeModel({
      model: AI_CONFIG.model,
      generationConfig: { responseMimeType: 'application/json' },
    });
  }
  return model;
}

// The SDK surfaces upstream HTTP status on GoogleGenerativeAIFetchError.status
// (429 → rate limited). Timeouts surface as GoogleGenerativeAIAbortError and
// blocked responses as GoogleGenerativeAIResponseError — neither has an HTTP
// status, and neither is a 429, so neither is retried.
function extractUpstreamStatus(error) {
  if (error && typeof error.status === 'number') return error.status;
  if (error && typeof error.cause?.status === 'number') return error.cause.status;
  return null;
}

async function generate(prompt) {
  const startedAt = Date.now();
  try {
    const result = await getModel().generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      },
      { timeout: AI_CONFIG.timeoutMs }
    );

    const usage = result.response.usageMetadata;
    return {
      text: result.response.text(), // throws if the prompt/candidate was blocked
      latencyMs: Date.now() - startedAt,
      tokenUsage: usage
        ? {
            input: usage.promptTokenCount,
            output: usage.candidatesTokenCount,
          }
        : undefined,
    };
  } catch (error) {
    const upstreamStatus = extractUpstreamStatus(error);
    throw new AIProviderError('Gemini provider request failed', {
      upstreamStatus,
      // Only 429 is retryable per docs/07 §5. Nothing about the SDK error
      // message, status text, or details is forwarded — no provider secrets
      // and no stack traces leak to the client.
      retryable: upstreamStatus === 429,
    });
  }
}

module.exports = { generate };
