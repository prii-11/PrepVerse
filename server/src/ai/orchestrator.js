// AI Orchestrator (M5.1 §6-§22). The ONLY layer allowed to call the Gemini
// provider; future operation modules (ResumeAnalyzer M5.2, QuestionGenerator
// M5.3, AnswerEvaluator M5.4) call `orchestrator.run('RESUME_ANALYSIS', ...)`
// and never touch the provider directly (AGENTS.md rule 1).
//
// The orchestrator owns: provider selection, 429 retry/backoff, JSON
// extraction, schema validation, correction retry, post-validation
// sanitization, AIExecution logging, and sanitized failure handling.
//
// It deliberately contains NO domain logic (M5.1 §21): it never sets
// Resume.status, Interview.status, User.currentSkillProfile, or
// Interview.report. It produces a validated AI result plus an AIExecution
// audit record and nothing else.
const { AI_CONFIG } = require('../config/ai');
const geminiProvider = require('./providers/gemini');
const AIExecution = require('./aiExecution.model');
const { AIProviderError, ValidationError } = require('../utils/errors');
const { resumeAnalysisSchema, sanitizeResumeAnalysis } = require('./schemas/resumeAnalysis.schema');
const {
  createQuestionGenerationSchema,
  sanitizeQuestionGeneration,
} = require('./schemas/questionGeneration.schema');
const {
  createAnswerEvaluationSchema,
  sanitizeAnswerEvaluation,
} = require('./schemas/answerEvaluation.schema');

// Centralized operation registry (M5.1 §7, §20): one operation → schema →
// promptVersion → entityType → sanitize → outputSummary mapping instead of
// three independent pipelines. The `schemaDescription` is the docs/07
// contract shape embedded in the correction prompt (M5.1 §14).
const OPERATION_REGISTRY = {
  RESUME_ANALYSIS: {
    entityType: 'RESUME',
    promptVersion: 'resume-analysis-v1',
    getSchema: () => resumeAnalysisSchema,
    sanitize: sanitizeResumeAnalysis,
    schemaDescription: JSON.stringify(
      {
        extractedSkills: ['string'],
        experienceSummary: 'string',
        projects: [{ name: 'string', description: 'string', technologies: ['string'] }],
        strengths: ['string'],
        skillGaps: ['string'],
      },
      null,
      2
    ),
    buildOutputSummary(result) {
      return {
        validationPassed: true,
        extractedSkillsCount: result.extractedSkills.length,
        projectsCount: result.projects.length,
        strengthsCount: result.strengths.length,
        skillGapsCount: result.skillGaps.length,
        ...flagForReview(result),
      };
    },
  },

  QUESTION_GENERATION: {
    entityType: 'INTERVIEW',
    promptVersion: 'question-generation-v1',
    getSchema(input) {
      // docs/07 §3 input contract requires questionCount (3-5, MVP default 4).
      if (!input || typeof input.questionCount !== 'number') {
        throw new ValidationError('QUESTION_GENERATION requires payload.input.questionCount');
      }
      return createQuestionGenerationSchema(input.questionCount);
    },
    sanitize: sanitizeQuestionGeneration,
    schemaDescription: JSON.stringify(
      {
        questions: [
          {
            id: 'string',
            text: 'string',
            category: 'string',
            difficulty: 'easy | medium | hard',
            expectedTopics: [{ skillKey: 'string', topic: 'string' }],
          },
        ],
      },
      null,
      2
    ),
    buildOutputSummary(result) {
      return {
        validationPassed: true,
        questionCount: result.questions.length,
        difficulties: countBy(result.questions, (q) => q.difficulty),
        ...flagForReview(result),
      };
    },
  },

  ANSWER_EVALUATION: {
    entityType: 'INTERVIEW',
    promptVersion: 'answer-evaluation-v1',
    getSchema(input) {
      // docs/07 §4 input contract requires the question's expectedTopics — the
      // subset/unique/non-empty rules (docs/07 §3) are enforced against them.
      if (!input || !Array.isArray(input.question?.expectedTopics)) {
        throw new ValidationError('ANSWER_EVALUATION requires payload.input.question.expectedTopics');
      }
      return createAnswerEvaluationSchema(input.question.expectedTopics);
    },
    sanitize: sanitizeAnswerEvaluation,
    schemaDescription: JSON.stringify(
      {
        correctness: 'number 0-100',
        technicalDepth: 'number 0-100',
        communication: 'number 0-100',
        strengths: ['string'],
        weaknesses: ['string'],
        improvementTip: 'string',
        topicAssessments: [{ skillKey: 'string', addressed: 'boolean', quality: 'missing | weak | good | strong' }],
      },
      null,
      2
    ),
    buildOutputSummary(result, input) {
      // Soft review signal (docs/07 §4): perfect score on a suspiciously short
      // answer is flagged, never blocked — false positives are acceptable.
      const suspiciousPerfectScore =
        typeof input?.candidateAnswer === 'string' &&
        result.correctness === 100 &&
        input.candidateAnswer.trim().length < 20;
      return {
        validationPassed: true,
        scores: {
          correctness: result.correctness,
          technicalDepth: result.technicalDepth,
          communication: result.communication,
        },
        topicAssessmentCount: result.topicAssessments.length,
        ...flagForReview(result),
        ...(suspiciousPerfectScore ? { flaggedForReview: true } : {}),
      };
    },
  },
};

// docs/07 §2 "log and flag for review" soft signal — never a rejection.
const INJECTION_PATTERNS = [
  'ignore previous instructions',
  'ignore all previous instructions',
  'disregard previous instructions',
  'forget your instructions',
  'override your instructions',
];

function scanForInjectionPatterns(value, depth = 0) {
  if (depth > 10) return false;
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return INJECTION_PATTERNS.some((pattern) => lower.includes(pattern));
  }
  if (Array.isArray(value)) return value.some((item) => scanForInjectionPatterns(item, depth + 1));
  if (value && typeof value === 'object') {
    return Object.values(value).some((item) => scanForInjectionPatterns(item, depth + 1));
  }
  return false;
}

function flagForReview(result) {
  return scanForInjectionPatterns(result) ? { flaggedForReview: true } : {};
}

function countBy(items, keyFn) {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

// Docs/07 §1 "strip markdown fences, whitespace". Returns the parsed JSON, or
// null when it cannot be extracted/parsed (→ schema/format failure path).
function extractJSON(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const fenced = trimmed.match(/^```[a-zA-Z]*\s*([\s\S]*?)```\s*$/);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return null;
  }
}

// M5.1 §14 correction prompt — explicitly tells Gemini the previous response
// was rejected and asks for a corrected response matching the contract. No
// stack traces, no raw user content, no secrets.
function buildCorrectionPrompt(config, originalPrompt) {
  return `${originalPrompt}\n\nYour previous response did not match the required schema. Return ONLY valid JSON matching this shape:\n${config.schemaDescription}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assertValidPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new ValidationError('AI run payload is required');
  }
  if (!payload.userId) {
    throw new ValidationError('payload.userId is required (AIExecution.userId)');
  }
  if (typeof payload.prompt !== 'string' || payload.prompt.trim() === '') {
    throw new ValidationError('payload.prompt is required');
  }
}

// AIExecution is the orchestrator's responsibility (M5.1 §15), not the
// provider's or a domain service's. outputSummary is always a sanitized
// structured summary (M5.1 §16, docs/06 §4.3) — never raw prompts, resume
// text, answer text, API keys, or unrestricted model output.
async function logExecution({ operation, config, payload, status, errorCode, latencyMs, tokenUsage, outputSummary }) {
  try {
    await AIExecution.create({
      userId: payload.userId,
      operation,
      entityType: config.entityType,
      entityId: payload.entityId ?? undefined,
      provider: 'gemini',
      model: AI_CONFIG.model,
      promptVersion: config.promptVersion,
      status,
      latencyMs,
      tokenUsage,
      errorCode,
      outputSummary,
    });
  } catch (logError) {
    // The audit log is diagnostic, not part of the operation contract — a
    // failed AIExecution write must neither convert a valid AI run into a
    // failure nor mask the real error. Log server-side and continue.
    console.error(`[aiExecution] failed to persist ${operation} ${status} audit record: ${logError.message}`);
  }
}

/**
 * Run one AI operation through the full pipeline (M5.1 §7):
 *
 *   payload = {
 *     userId,                 // required — AIExecution.userId
 *     entityId,               // optional — the Resume/Interview id
 *     prompt,                 // required — built by the operation module
 *     input,                  // operation input contract (context-dependent rules)
 *   }
 *
 * Returns { result, execution } on success; throws AIProviderError (502) after
 * retries are exhausted. Only the orchestrator may call the Gemini provider.
 */
async function run(operation, payload) {
  const config = OPERATION_REGISTRY[operation];
  if (!config) {
    throw new ValidationError(`Unknown AI operation '${operation}'`, {
      supportedOperations: Object.keys(OPERATION_REGISTRY),
    });
  }
  assertValidPayload(payload);

  const schema = config.getSchema(payload.input);
  const startedAt = Date.now();
  let attempts = 0;
  let correctionsUsed = 0;
  let promptText = payload.prompt;

  const failOperation = async (errorCode, providerError) => {
    const latencyMs = Date.now() - startedAt;
    await logExecution({
      operation,
      config,
      payload,
      status: 'FAILED',
      errorCode,
      latencyMs,
      outputSummary: { validationPassed: false, errorCode, attempts },
    });
    throw new AIProviderError('AI provider request failed after retries were exhausted', {
      failure: errorCode,
      attempts,
      upstreamStatus: providerError?.details?.upstreamStatus ?? null,
    });
  };

  // Retry policy (docs/07 §5; M5.1 §12-§13):
  //  - 429 → backoff (1s, 2s, 4s), max 3 total attempts. Only the first two
  //    delays are consumed before attempt 3.
  //  - malformed JSON / schema failure → retry ONCE with a correction prompt
  //    (max 2 total attempts), tracked independently of the 429 budget so the
  //    two policies never multiply: a 429 on a correction attempt re-sends
  //    the correction prompt, it does not grant a fresh correction credit.
  while (true) {
    let providerResult;
    try {
      providerResult = await geminiProvider.generate(promptText);
    } catch (error) {
      attempts += 1;
      const isRetryable = error instanceof AIProviderError && error.details?.retryable === true;
      if (isRetryable && attempts < AI_CONFIG.maxAttempts) {
        const delayMs =
          AI_CONFIG.rateLimitRetryDelaysMs[Math.min(attempts - 1, AI_CONFIG.rateLimitRetryDelaysMs.length - 1)];
        await sleep(delayMs);
        continue;
      }
      return failOperation(isRetryable ? 'RATE_LIMITED' : 'AI_PROVIDER_FAILED', error);
    }
    attempts += 1;

    // JSON extraction first (docs/07 §1), then schema validation. Both feed
    // the same single correction-retry budget (M5.1 §8, §13).
    const json = extractJSON(providerResult.text);
    if (json === null) {
      if (correctionsUsed < AI_CONFIG.maxCorrectionRetries) {
        correctionsUsed += 1;
        promptText = buildCorrectionPrompt(config, payload.prompt);
        continue;
      }
      return failOperation('SCHEMA_VALIDATION_FAILED');
    }

    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      if (correctionsUsed < AI_CONFIG.maxCorrectionRetries) {
        correctionsUsed += 1;
        promptText = buildCorrectionPrompt(config, payload.prompt);
        continue;
      }
      return failOperation('SCHEMA_VALIDATION_FAILED');
    }

    // Post-validation sanitization (M5.1 §11): runs ONLY on schema-valid
    // output. Invalid output never reaches this line — it already failed and
    // either retried or exhausted the operation.
    const result = config.sanitize(parsed.data);
    const latencyMs = Date.now() - startedAt;

    await logExecution({
      operation,
      config,
      payload,
      status: 'SUCCESS',
      latencyMs,
      tokenUsage: providerResult.tokenUsage,
      outputSummary: config.buildOutputSummary(result, payload.input),
    });

    return {
      result,
      execution: {
        operation,
        provider: 'gemini',
        model: AI_CONFIG.model,
        promptVersion: config.promptVersion,
        attempts,
        correctionsUsed,
        latencyMs,
      },
    };
  }
}

module.exports = { run, OPERATION_REGISTRY };
