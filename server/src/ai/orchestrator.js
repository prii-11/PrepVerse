// AI Orchestrator (M5.1 §6-§22, M5.7 AI failover). The ONLY layer allowed to
// call AI providers (AGENTS.md rule 1); future operation modules
// (ResumeAnalyzer M5.2, QuestionGenerator M5.3, AnswerEvaluator M5.4) call
// `orchestrator.run('RESUME_ANALYSIS', ...)` and never touch a provider
// directly.
//
// The orchestrator owns: candidate selection (provider registry), 429
// retry/backoff, provider failover, JSON extraction, schema validation,
// correction retry, post-validation sanitization, AIExecution logging (one
// row per candidate attempt), and sanitized failure handling.
//
// It deliberately contains NO domain logic (M5.1 §21): it never sets
// Resume.status, Interview.status, User.currentSkillProfile, or
// Interview.report. It produces a validated AI result plus AIExecution audit
// records and nothing else.
//
// M5.7 failover policy (docs/16-ai-failover.md — the milestone contract):
//   - Candidates come from the provider registry, ordered by configured
//     priority (same-provider alternate models before cross-provider).
//   - failover-eligible failures (QUOTA_EXHAUSTED, RATE_LIMITED,
//     PROVIDER_UNAVAILABLE, TIMEOUT) move the request to the next candidate
//     IMMEDIATELY; quota/rate failures additionally mark the candidate in the
//     in-process health store so concurrent requests skip it.
//   - RATE_LIMITED keeps the frozen docs/07 §5 same-candidate backoff
//     (1s, 2s, 4s, max 3 attempts). QUOTA_EXHAUSTED never gets a repeated
//     retry against the exhausted candidate.
//   - Contract failures (malformed JSON, schema validation, INVALID_REQUEST,
//     AUTHENTICATION_FAILED, UNKNOWN, application bugs) NEVER trigger provider
//     failover — they end the operation (schema failures follow the existing
//     single-correction-retry policy). Provider failover is for provider
//     capacity/availability problems, not for hiding application defects.
const { AI_CONFIG } = require('../config/ai');
const providerRegistry = require('./providers/registry');
const health = require('./health');
const AIExecution = require('./aiExecution.model');
const { AIProviderError, ValidationError } = require('../utils/errors');
const {
  CATEGORIES,
  isFailoverEligible,
  errorCodeFor,
  SCHEMA_VALIDATION_FAILED,
  NO_ELIGIBLE_PROVIDER,
} = require('./providers/classify');
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
    // Gemini-compatible JSON Schema for structured output enforcement.
    // Matches the Zod schema in schemas/resumeAnalysis.schema.js.
    getResponseSchema() {
      return {
        type: 'object',
        properties: {
          extractedSkills: { type: 'array', items: { type: 'string' } },
          experienceSummary: { type: 'string' },
          projects: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                description: { type: 'string' },
                technologies: { type: 'array', items: { type: 'string' } },
              },
              required: ['name', 'description', 'technologies'],
            },
          },
          strengths: { type: 'array', items: { type: 'string' } },
          skillGaps: { type: 'array', items: { type: 'string' } },
        },
        required: ['extractedSkills', 'experienceSummary', 'projects', 'strengths', 'skillGaps'],
      };
    },
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
    // Gemini-compatible JSON Schema for structured output enforcement.
    // Matches the Zod schema in schemas/questionGeneration.schema.js.
    getResponseSchema() {
      return {
        type: 'object',
        properties: {
          questions: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                text: { type: 'string' },
                category: {
                  type: 'string',
                  enum: ['algorithms', 'data-structures', 'system-design', 'database', 'api-design', 'debugging', 'concurrency', 'behavioral'],
                },
                difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
                expectedTopics: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      skillKey: { type: 'string' },
                      topic: { type: 'string' },
                    },
                    required: ['skillKey', 'topic'],
                  },
                },
              },
              required: ['id', 'text', 'category', 'difficulty', 'expectedTopics'],
            },
          },
        },
        required: ['questions'],
      };
    },
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
    promptVersion: 'answer-evaluation-v2',
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
    // Gemini-compatible JSON Schema for structured output enforcement.
    // Matches the Zod schema in schemas/answerEvaluation.schema.js.
    getResponseSchema() {
      return {
        type: 'object',
        properties: {
          correctness: { type: 'number' },
          technicalDepth: { type: 'number' },
          communication: { type: 'number' },
          strengths: { type: 'array', items: { type: 'string' } },
          weaknesses: { type: 'array', items: { type: 'string' } },
          improvementTip: { type: 'string' },
          topicAssessments: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                skillKey: { type: 'string' },
                addressed: { type: 'boolean' },
                quality: { type: 'string', enum: ['missing', 'weak', 'good', 'strong'] },
              },
              required: ['skillKey', 'addressed', 'quality'],
            },
          },
        },
        required: ['correctness', 'technicalDepth', 'communication', 'strengths', 'weaknesses', 'improvementTip', 'topicAssessments'],
      };
    },
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

// M5.1 §14 correction prompt — explicitly tells the model the previous
// response was rejected and asks for a corrected response matching the
// contract. No stack traces, no raw user content, no secrets.
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

// Normalize ANY provider-caught error into a provider-neutral category.
// Adapters surface AIProviderError with details.category; legacy/mocked
// errors (and defensive gaps) are derived from the pre-M5.7 contract fields
// (retryable ⇔ 429-family, upstream status) so existing behavior is preserved.
function classifyProviderError(error) {
  if (error instanceof AIProviderError) {
    if (error.details?.category) return error.details.category;
    if (error.details?.retryable === true) return CATEGORIES.RATE_LIMITED;
    const status = error.details?.upstreamStatus;
    if (typeof status === 'number' && status >= 500 && status <= 599) return CATEGORIES.PROVIDER_UNAVAILABLE;
    if (typeof status === 'number') return CATEGORIES.INVALID_REQUEST;
    return CATEGORIES.UNKNOWN;
  }
  return CATEGORIES.UNKNOWN;
}

function candidateLabel(candidate) {
  return `${candidate.provider}/${candidate.model}`;
}

// Final contract failure (docs/07 §5 correction budget exhausted): malformed
// JSON or schema-validated output that STAYS invalid gets one FAILED
// AIExecution row and a typed SCHEMA_VALIDATION_FAILED — provider failover is
// deliberately NOT triggered (docs/16-ai-failover.md §Non-failover: it would
// hide a shared prompt/schema bug).
async function failContractValidation({ operation, config, payload, startedAt, candidate, attempts, previousCandidate, previousCategory }) {
  const latencyMs = Date.now() - startedAt;
  await logExecution({
    operation,
    config,
    payload,
    provider: candidate.provider,
    model: candidate.model,
    attempt: attempts,
    fallbackFrom: previousCandidate,
    fallbackReason: previousCategory,
    status: 'FAILED',
    errorCode: SCHEMA_VALIDATION_FAILED,
    latencyMs,
    outputSummary: { validationPassed: false, errorCode: SCHEMA_VALIDATION_FAILED, attempts },
  });
  throw new AIProviderError('AI provider request failed after retries were exhausted', {
    failure: SCHEMA_VALIDATION_FAILED,
    attempts,
  });
}

// AIExecution is the orchestrator's responsibility (M5.1 §15), not the
// provider's or a domain service's. One row PER CANDIDATE ATTEMPT (M5.7 —
// docs/05 §6 "one document per AI call"), so a failover chain leaves a
// complete, reconstructible trace: provider/model per attempt, failure
// category, fallback link, and the final producer. outputSummary is always a
// sanitized structured summary (M5.1 §16, docs/06 §4.3) — never raw prompts,
// resume text, answer text, API keys, or unrestricted model output.
async function logExecution({ operation, config, payload, provider, model, attempt, fallbackFrom, fallbackReason, status, errorCode, latencyMs, tokenUsage, outputSummary }) {
  try {
    await AIExecution.create({
      userId: payload.userId,
      operation,
      entityType: config.entityType,
      entityId: payload.entityId ?? undefined,
      provider,
      model,
      promptVersion: config.promptVersion,
      attempt,
      fallbackFrom,
      fallbackReason,
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
 * Run one AI operation through the full pipeline (M5.1 §7, M5.7):
 *
 *   payload = {
 *     userId,                 // required — AIExecution.userId
 *     entityId,               // optional — the Resume/Interview id
 *     prompt,                 // required — built by the operation module
 *     input,                  // operation input contract (context-dependent rules)
 *   }
 *
 * Returns { result, execution } on success; throws AIProviderError (502) after
 * the candidate chain or the attempt budget is exhausted. Only the
 * orchestrator may call AI providers.
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
  let previousCandidate = null; // "provider/model" label the chain came from
  let previousCategory = null; // that candidate's failure category
  let lastProviderError = null;
  let candidatesTried = 0;

  // Candidate chain (ordered by configured priority, filtered by operation
  // capability, health state, and configuration validity). failoverEnabled
  // reduces the chain to the first candidate — the exact pre-M5.7 behavior.
  const eligibleCandidates = providerRegistry.getCandidates(operation);
  const candidates = AI_CONFIG.failoverEnabled ? eligibleCandidates : eligibleCandidates.slice(0, 1);

  if (candidates.length === 0) {
    const latencyMs = Date.now() - startedAt;
    await logExecution({
      operation,
      config,
      payload,
      status: 'FAILED',
      errorCode: NO_ELIGIBLE_PROVIDER,
      latencyMs,
      outputSummary: { validationPassed: false, errorCode: NO_ELIGIBLE_PROVIDER, attempts },
    });
    throw new AIProviderError('No eligible AI provider/model is configured for this operation', {
      failure: NO_ELIGIBLE_PROVIDER,
      attempts,
    });
  }

  // Retry vs failover policy (docs/07 §5 preserved; docs/16-ai-failover.md):
  //  - RATE_LIMITED → same-candidate backoff (1s, 2s, 4s), max 3 attempts,
  //    then fail over to the next candidate.
  //  - QUOTA_EXHAUSTED / PROVIDER_UNAVAILABLE / TIMEOUT → fail over
  //    immediately (quota never gets a repeated retry on the exhausted
  //    candidate).
  //  - Schema/JSON failure → retry ONCE with a correction prompt on the SAME
  //    candidate (model-specific context), then hard failure. NEVER failover.
  //  - Non-failover provider failures → immediate hard failure, no switch.
  //  - maxTotalAttempts bounds total provider calls across the whole chain.
  for (let i = 0; i < candidates.length && attempts < AI_CONFIG.maxTotalAttempts; i += 1) {
    const candidate = candidates[i];
    candidatesTried += 1;
    let sameCandidateRetries = 0;
    // The correction context belongs to the model that actually responded —
    // each candidate starts from the original prompt, never a stale correction
    // aimed at a failed candidate.
    let promptText = payload.prompt;

    while (true) {
      const attemptStartedAt = Date.now();

      // Chain-link provenance: an attempt's row records the candidate it CAME
      // FROM. Captured before any failure handling — a candidate's own failure
      // rows reference its predecessor, and the link advances only when the
      // request actually moves to the next candidate.
      let cameFrom = previousCandidate;
      let cameReason = previousCategory;

      let providerResult;
      try {
        const responseSchema = typeof config.getResponseSchema === 'function' ? config.getResponseSchema() : undefined;
        providerResult = await candidate.adapter.generate(promptText, { model: candidate.model, responseSchema });
        attempts += 1;
      } catch (error) {
        attempts += 1;
        lastProviderError = error;
        const attemptLatencyMs = Date.now() - attemptStartedAt;
        const category = classifyProviderError(error);
        const code = errorCodeFor(category);
        // cameFrom/cameReason above are captured pre-call (chain-link rows).

        // The 429 retry gate (docs/07 §5 preserved): backoff, max 3 attempts
        // on the same candidate. The attempt budget is a hard cap — a spent
        // budget ends the operation rather than queueing more calls.
        const retryAllowed =
          category === CATEGORIES.RATE_LIMITED && sameCandidateRetries < AI_CONFIG.maxAttempts - 1 && attempts < AI_CONFIG.maxTotalAttempts;

        if (retryAllowed) {
          sameCandidateRetries += 1;
          // Fire-and-forget: the audit write must never gate the retry loop —
          // B1-style fake-timer tests advance the clock with microtask ticks,
          // and an awaited DB write inside the backoff window deadlocks them
          // (logExecution swallows persistence errors internally).
          void logExecution({
            operation,
            config,
            payload,
            provider: candidate.provider,
            model: candidate.model,
            attempt: attempts,
            fallbackFrom: cameFrom,
            fallbackReason: cameReason,
            status: 'FAILED',
            errorCode: code,
            latencyMs: attemptLatencyMs,
            outputSummary: { validationPassed: false, errorCode: code, category, attempts },
          });
          await sleep(
            AI_CONFIG.rateLimitRetryDelaysMs[
              Math.min(sameCandidateRetries - 1, AI_CONFIG.rateLimitRetryDelaysMs.length - 1)
            ]
          );
          continue;
        }

        if (isFailoverEligible(category)) {
          // Mark the candidate in the shared health store so OTHER in-flight
          // requests stop selecting it during the cooldown window (quota: long,
          // rate limit: short). Only meaningful when a fallback exists: with a
          // single candidate, marking would blind the only route and fail fast
          // with NO_ELIGIBLE_PROVIDER instead of retrying the same provider.
          if (candidates.length > 1) {
            if (category === CATEGORIES.QUOTA_EXHAUSTED) {
              health.markQuotaExhausted(candidate.provider, candidate.model);
            } else if (category === CATEGORIES.RATE_LIMITED) {
              health.markRateLimited(candidate.provider, candidate.model);
            }
          }
          previousCandidate = candidateLabel(candidate);
          previousCategory = category;
          // The last row IS the run's terminal record — persist it
          // deterministically so a rejected run is auditable the moment it
          // rejects (no duplicate row: the post-loop path throws only).
          // Mid-chain rows stay fire-and-forget so the backoff window of the
          // NEXT candidate is not gated on a DB write.
          const auditPromise = logExecution({
            operation,
            config,
            payload,
            provider: candidate.provider,
            model: candidate.model,
            attempt: attempts,
            fallbackFrom: cameFrom,
            fallbackReason: cameReason,
            status: 'FAILED',
            errorCode: code,
            latencyMs: attemptLatencyMs,
            outputSummary: { validationPassed: false, errorCode: code, category, attempts },
          });
          const isTerminal = i === candidates.length - 1 || attempts >= AI_CONFIG.maxTotalAttempts;
          if (isTerminal) await auditPromise;
          else void auditPromise;
          break;
        }

        // Non-failover failure — application/contract/config defect or an
        // ambiguous signal. NO provider switch, immediate final failure
        // (terminal by construction → persisted before the throw).
        await logExecution({
          operation,
          config,
          payload,
          provider: candidate.provider,
          model: candidate.model,
          attempt: attempts,
          fallbackFrom: cameFrom,
          fallbackReason: cameReason,
          status: 'FAILED',
          errorCode: code,
          latencyMs: attemptLatencyMs,
          outputSummary: { validationPassed: false, errorCode: code, category, attempts },
        });
        throw new AIProviderError('AI provider request failed', {
          failure: code,
          attempts,
          category,
          upstreamStatus: error.details?.upstreamStatus ?? null,
        });
      }

      // JSON extraction first (docs/07 §1), then schema validation. Both feed
      // the same single correction-retry budget (M5.1 §8, §13) and NEVER
      // trigger provider failover.
      const json = extractJSON(providerResult.text);
      if (json === null) {
        if (correctionsUsed < AI_CONFIG.maxCorrectionRetries && attempts < AI_CONFIG.maxTotalAttempts) {
          correctionsUsed += 1;
          // Per-attempt audit: this contract failure is recorded (fire-and-
          // forget — the correction retry must not wait on the DB), and the
          // correction continues on the SAME candidate.
          void logExecution({
            operation,
            config,
            payload,
            provider: candidate.provider,
            model: candidate.model,
            attempt: attempts,
            fallbackFrom: cameFrom,
            fallbackReason: cameReason,
            status: 'FAILED',
            errorCode: SCHEMA_VALIDATION_FAILED,
            latencyMs: Date.now() - attemptStartedAt,
            outputSummary: { validationPassed: false, errorCode: SCHEMA_VALIDATION_FAILED, attempts },
          });
          promptText = buildCorrectionPrompt(config, payload.prompt);
          continue;
        }
        return failContractValidation({ operation, config, payload, startedAt, candidate, attempts, previousCandidate, previousCategory });
      }

      const parsed = schema.safeParse(json);
      if (!parsed.success) {
        if (correctionsUsed < AI_CONFIG.maxCorrectionRetries && attempts < AI_CONFIG.maxTotalAttempts) {
          correctionsUsed += 1;
          void logExecution({
            operation,
            config,
            payload,
            provider: candidate.provider,
            model: candidate.model,
            attempt: attempts,
            fallbackFrom: cameFrom,
            fallbackReason: cameReason,
            status: 'FAILED',
            errorCode: SCHEMA_VALIDATION_FAILED,
            latencyMs: Date.now() - attemptStartedAt,
            outputSummary: { validationPassed: false, errorCode: SCHEMA_VALIDATION_FAILED, attempts },
          });
          promptText = buildCorrectionPrompt(config, payload.prompt);
          continue;
        }
        return failContractValidation({ operation, config, payload, startedAt, candidate, attempts, previousCandidate, previousCategory });
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
        provider: candidate.provider,
        model: candidate.model,
        attempt: attempts,
        fallbackFrom: previousCandidate,
        fallbackReason: previousCategory,
        status: 'SUCCESS',
        latencyMs,
        tokenUsage: providerResult.tokenUsage,
        outputSummary: config.buildOutputSummary(result, payload.input),
      });

      return {
        result,
        execution: {
          operation,
          provider: candidate.provider,
          model: candidate.model,
          promptVersion: config.promptVersion,
          attempts,
          correctionsUsed,
          latencyMs,
          candidatesTried,
          fallbackFrom: previousCandidate,
          fallbackReason: previousCategory,
        },
      };
    }
  }

  // Every eligible candidate failed (or the attempt budget was spent). The
  // last FAILED AIExecution row was already persisted per attempt — no
  // duplicate row. End with one clear typed failure.
  const finalCategory = previousCategory ?? (lastProviderError ? classifyProviderError(lastProviderError) : CATEGORIES.UNKNOWN);
  throw new AIProviderError('AI provider request failed after retries were exhausted', {
    failure: errorCodeFor(finalCategory),
    attempts,
    category: finalCategory,
    candidatesTried,
    upstreamStatus: lastProviderError?.details?.upstreamStatus ?? null,
  });
}

module.exports = { run, OPERATION_REGISTRY };