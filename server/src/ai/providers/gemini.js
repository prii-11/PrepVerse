// Gemini provider adapter (M5.1 §5, M5.7 model-aware). This file is the ONLY
// place in the codebase that touches the Gemini SDK — an adapter around
// Gemini, nothing more. It takes a prompt, makes exactly ONE provider call,
// and returns the raw text plus usage metadata.
//
// It deliberately does NOT: write MongoDB, create AIExecution records, perform
// domain aggregation, update Resume/User/Interview, implement retry loops, or
// know about SkillProfileService/analytics/HTTP. Retry, failover, JSON
// extraction, schema validation, and AIExecution logging all live in the
// orchestrator, which is the only caller of this module.
//
// Failures are surfaced as AIProviderError with `details.category`
// (provider-neutral classification, see providers/classify.js) plus
// `details.retryable` (true only for the 429 family — the only condition
// docs/07 §5 says to back off on). Deciding what to retry and what to fail
// over is the orchestrator's job, not this module's.
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { AI_CONFIG } = require('../../config/ai');
const { AIProviderError } = require('../../utils/errors');
const { classifyGeminiError } = require('./classify');

// Lazily constructed per model id so requiring this module doesn't fail-fast
// the whole AI layer — but config/ai.js already refuses to load without a key
// when gemini is the primary provider, so if we get here the key exists.
const modelCache = new Map();

function getModel(modelId) {
  const id = modelId || AI_CONFIG.model;
  if (!modelCache.has(id)) {
    const genAI = new GoogleGenerativeAI(AI_CONFIG.GEMINI_API_KEY);
    modelCache.set(
      id,
      genAI.getGenerativeModel({
        model: id,
        generationConfig: { responseMimeType: 'application/json' },
      })
    );
  }
  return modelCache.get(id);
}

// The SDK surfaces upstream HTTP status on GoogleGenerativeAIFetchError.status
// (429 → rate limited/quota). Timeouts surface as GoogleGenerativeAIAbortError
// and blocked responses as GoogleGenerativeAIResponseError — the classifier
// (providers/classify.js) maps each shape to a provider-neutral category.
function extractUpstreamStatus(error) {
  if (error && typeof error.status === 'number') return error.status;
  if (error && typeof error.cause?.status === 'number') return error.cause.status;
  return null;
}

async function generate(prompt, { model, responseSchema } = {}) {
  const startedAt = Date.now();
  try {
    const generationConfig = { responseMimeType: 'application/json' };
    if (responseSchema) {
      generationConfig.responseSchema = responseSchema;
    }

    const result = await getModel(model).generateContent(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig,
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
    const category = classifyGeminiError(error);
    throw new AIProviderError('Gemini provider request failed', {
      upstreamStatus: extractUpstreamStatus(error),
      category,
      // 429-family only — preserves docs/07 §5 retry semantics. Nothing about
      // the SDK error message, status text, or details is forwarded — no
      // provider secrets and no stack traces leak to the client.
      retryable: category === 'RATE_LIMITED' || category === 'QUOTA_EXHAUSTED',
    });
  }
}

module.exports = { generate, getModel, NAME: 'gemini', MODEL: AI_CONFIG.model };