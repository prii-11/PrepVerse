// M5.7 AI provider failover tests (docs/16-ai-failover.md). Proves the
// candidate chain end-to-end: registry ordering/capability/key gating, failure
// classification, retry-vs-failover policy, the hard attempt budget, health
// cooldowns (including a real-concurrency herd test), and the per-attempt
// AIExecution chain-link provenance. No real provider calls — both provider
// adapters (gemini + groq) are mocked deterministically, routed by
// (provider, model) so a different model on the same provider is provably a
// different candidate.
//
// Environment note: config/env.js fail-fasts at require time on missing
// startup vars and config/ai.js throws without GEMINI_API_KEY — set all
// process vars BEFORE any module require. node --test runs each file in its
// own process, so this preamble is process-local (m5.1 keeps its own env).
// AI_MAX_TOTAL_ATTEMPTS is deliberately SMALL (4) here: the default 4 is also
// the deployment answer, but only a tight budget makes a "budget spent before
// the chain is exhausted" state reachable with a 5-candidate chain.
// Cooldowns are short-and-nonzero so health-gating behavior is real yet fast.
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';
process.env.GROQ_API_KEY = 'test-groq-api-key-12345';
process.env.AI_PROVIDER_CHAIN = 'gemini,groq';
process.env.AI_GEMINI_MODELS = 'gemini-a,gemini-b,gemini-c';
process.env.AI_GROQ_MODELS = 'groq-a,groq-b';
process.env.AI_GROQ_CAPABILITIES = 'QUESTION_GENERATION,ANSWER_EVALUATION';
process.env.AI_MAX_TOTAL_ATTEMPTS = '4';
process.env.AI_QUOTA_COOLDOWN_MS = '500';
process.env.AI_RATE_LIMIT_COOLDOWN_MS = '500';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { AI_CONFIG } = require('../src/config/ai');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const orchestrator = require('../src/ai/orchestrator');
const { AIProviderError } = require('../src/utils/errors');
const AIExecution = require('../src/ai/aiExecution.model');
const classifier = require('../src/ai/providers/classify');
const registry = require('../src/ai/providers/registry');
const health = require('../src/ai/health');
const geminiProvider = require('../src/ai/providers/gemini');
const groqProvider = require('../src/ai/providers/groq');
const { createAnswerEvaluationSchema, sanitizeAnswerEvaluation } = require('../src/ai/schemas/answerEvaluation.schema');
const { createQuestionGenerationSchema, sanitizeQuestionGeneration } = require('../src/ai/schemas/questionGeneration.schema');
const { resumeAnalysisSchema, sanitizeResumeAnalysis } = require('../src/ai/schemas/resumeAnalysis.schema');

const realGeminiGenerate = geminiProvider.generate;
const realGroqGenerate = groqProvider.generate;

// ---- deterministic per-candidate mock ---------------------------------------
// route(provider) binds the adapter's generate(); items are keyed by
// "provider::model", so "unexpected" calls to an un-queued candidate fail
// loudly (a non-AIProviderError → UNKNOWN → non-failover throw).

const queues = new Map();
const calls = [];

function route(provider) {
  return async (prompt, { model } = {}) => {
    const key = `${provider}::${model}`;
    const item = (queues.get(key) || []).shift();
    calls.push({ provider, model, at: Date.now(), kind: item?.kind ?? 'unexpected', category: item?.category ?? null });
    if (item && item.kind === 'success') {
      return { text: item.text, latencyMs: 1, tokenUsage: item.tokenUsage };
    }
    if (item && item.kind === 'error') {
      throw new AIProviderError('mock upstream failure', {
        category: item.category,
        upstreamStatus: item.upstreamStatus,
        retryable: item.category === 'RATE_LIMITED' || item.category === 'QUOTA_EXHAUSTED',
      });
    }
    throw new Error(`mock: unexpected ${provider} call for ${model}`);
  };
}

function enqueue(provider, model, ...items) {
  const key = `${provider}::${model}`;
  queues.set(key, (queues.get(key) || []).concat(items));
}

function resetMocks() {
  queues.clear();
  calls.length = 0;
}

function installMocks() {
  geminiProvider.generate = route('gemini');
  groqProvider.generate = route('groq');
}

function restoreMocks() {
  geminiProvider.generate = realGeminiGenerate;
  groqProvider.generate = realGroqGenerate;
}

const successItem = (text, tokenUsage = { input: 10, output: 5 }) => ({ kind: 'success', text, tokenUsage });
const errorItem = (category, upstreamStatus = 500) => ({ kind: 'error', category, upstreamStatus });

// ---- fixtures ---------------------------------------------------------------

const VALID_RESUME = {
  extractedSkills: ['javascript', 'nodejs'],
  experienceSummary: '5 years building web applications and APIs.',
  projects: [{ name: 'PrepVerse', description: 'Mock interview platform', technologies: ['nodejs'] }],
  strengths: ['API design'],
  skillGaps: ['kubernetes'],
};

const VALID_ANSWER = {
  correctness: 80,
  technicalDepth: 70,
  communication: 60,
  strengths: ['clear structure'],
  weaknesses: ['missing depth'],
  improvementTip: 'Add a concrete example of a covering index.',
  topicAssessments: [{ skillKey: 'mongodb', addressed: true, quality: 'good' }],
};

const VALID_QUESTION = {
  questions: [
    {
      id: 'q1',
      text: 'What is a MongoDB index?',
      category: 'database',
      difficulty: 'medium',
      expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }],
    },
    { id: 'q2', text: 'Explain database transactions.', category: 'database', difficulty: 'hard', expectedTopics: [{ skillKey: 'mongodb', topic: 'transactions' }] },
  ],
};

function newUserId() {
  return new mongoose.Types.ObjectId().toString();
}

function resumePayload(prompt = 'Analyze this resume. Target role: Backend Developer') {
  return {
    userId: newUserId(),
    entityId: new mongoose.Types.ObjectId().toString(),
    prompt,
    input: { resumeText: 'sample resume text', targetRole: 'Backend Developer', experienceLevel: 'Entry' },
  };
}

function answerPayload() {
  return {
    userId: newUserId(),
    entityId: new mongoose.Types.ObjectId().toString(),
    prompt: 'Evaluate this answer.',
    input: {
      question: { text: 'What is an index?', category: 'databases', difficulty: 'medium', expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }] },
      candidateAnswer: 'An index speeds up lookups.',
      candidateProfile: { targetRole: 'Backend Developer', experienceLevel: 'Entry' },
    },
  };
}

function rowsFor(userId) {
  return AIExecution.find({ userId }).sort({ attempt: 1 }).lean();
}

// ---- DB lifecycle -----------------------------------------------------------

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  installMocks();
});

test.after(async () => {
  restoreMocks();
  await mongoose.disconnect();
  await mongoServer.stop();
});

test.beforeEach(() => {
  resetMocks();
  health.reset();
  installMocks();
});

// -----------------------------------------------------------------------------
// 1. Failure classification (providers/classify.js) — unit matrix
// -----------------------------------------------------------------------------

test('M5.7-1. HTTP classification: 429 → RATE_LIMITED; quota-signaled 429/403 → QUOTA_EXHAUSTED', () => {
  const c = classifier.CATEGORIES;
  assert.equal(classifier.classifyHttpFailure({ status: 429, message: 'Too many requests' }), c.RATE_LIMITED);
  assert.equal(classifier.classifyHttpFailure({ status: 429, message: '', details: [{ reason: 'QUOTA_EXHAUSTED' }] }), c.QUOTA_EXHAUSTED);
  assert.equal(classifier.classifyHttpFailure({ status: 429, message: 'Resource has been exhausted (e.g. check quota)' }), c.QUOTA_EXHAUSTED);
  assert.equal(classifier.classifyHttpFailure({ status: 403, message: 'Daily limit exhausted' }), c.QUOTA_EXHAUSTED);
  assert.equal(classifier.classifyHttpFailure({ status: 429, message: 'Rate limit reached, retry later' }), c.RATE_LIMITED, "a bare 'rate limit' message stays RATE_LIMITED");
});

test('M5.7-2. HTTP classification: auth/invalid/unavailable/unknown buckets', () => {
  const c = classifier.CATEGORIES;
  assert.equal(classifier.classifyHttpFailure({ status: 401 }), c.AUTHENTICATION_FAILED);
  assert.equal(classifier.classifyHttpFailure({ status: 403, message: 'API key not valid' }), c.AUTHENTICATION_FAILED, '403 without quota wording is auth');
  assert.equal(classifier.classifyHttpFailure({ status: 400, message: 'bad request' }), c.INVALID_REQUEST);
  assert.equal(classifier.classifyHttpFailure({ status: 404, message: 'model not found' }), c.PROVIDER_UNAVAILABLE);
  assert.equal(classifier.classifyHttpFailure({ status: 503 }), c.PROVIDER_UNAVAILABLE);
  assert.equal(classifier.classifyHttpFailure({ status: 500 }), c.PROVIDER_UNAVAILABLE);
  assert.equal(classifier.classifyHttpFailure({}), c.UNKNOWN);
  assert.equal(classifier.classifyHttpFailure({ status: 200 }), c.UNKNOWN, '2xx via this path is anomalous — never guessed');
});

test('M5.7-3. fetch-throw classification: timeout vs network vs unknown', () => {
  const c = classifier.CATEGORIES;
  assert.equal(classifier.classifyFetchThrow({ name: 'TimeoutError' }), c.TIMEOUT);
  assert.equal(classifier.classifyFetchThrow({ name: 'AbortError' }), c.TIMEOUT);
  assert.equal(classifier.classifyFetchThrow(new TypeError('fetch failed')), c.PROVIDER_UNAVAILABLE);
  assert.equal(classifier.classifyFetchThrow({ name: 'WeirdError' }), c.UNKNOWN);
});

test('M5.7-4. Gemini SDK error duck-typing (no SDK import): status/message/reason surface', () => {
  const c = classifier.CATEGORIES;
  assert.equal(classifier.classifyGeminiError({ name: 'GoogleGenerativeAIAbortError' }), c.TIMEOUT);
  assert.equal(classifier.classifyGeminiError({ name: 'GoogleGenerativeAIRequestInputError' }), c.INVALID_REQUEST);
  assert.equal(classifier.classifyGeminiError({ name: 'GoogleGenerativeAIResponseError', status: 429, message: 'Rate limit' }), c.RATE_LIMITED);
  assert.equal(classifier.classifyGeminiError({ status: 429, message: 'quota exhausted for model' }), c.QUOTA_EXHAUSTED);
  assert.equal(classifier.classifyGeminiError({ status: 429, message: '', errorDetails: [{ reason: 'RESOURCE_EXHAUSTED' }] }), c.QUOTA_EXHAUSTED);
  assert.equal(classifier.classifyGeminiError({ status: 500 }), c.PROVIDER_UNAVAILABLE);
  assert.equal(classifier.classifyGeminiError({ status: 403, message: 'API key not valid' }), c.AUTHENTICATION_FAILED);
  assert.equal(classifier.classifyGeminiError({ name: 'GoogleGenerativeAIResponseError' }), c.UNKNOWN, 'status-less SDK response error is ambiguous, never guessed');
  assert.equal(classifier.classifyGeminiError({ name: 'Nonsense' }), c.UNKNOWN);
});

test('M5.7-5. errorCode mapping preserves the legacy codes and adds availability codes', () => {
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.RATE_LIMITED), 'RATE_LIMITED');
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.QUOTA_EXHAUSTED), 'QUOTA_EXHAUSTED');
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.PROVIDER_UNAVAILABLE), 'AI_PROVIDER_FAILED', 'legacy code preserved');
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.TIMEOUT), 'TIMEOUT');
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.AUTHENTICATION_FAILED), 'AUTHENTICATION_FAILED');
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.INVALID_REQUEST), 'AI_PROVIDER_FAILED', 'legacy code preserved');
  assert.equal(classifier.errorCodeFor(classifier.CATEGORIES.UNKNOWN), 'AI_PROVIDER_FAILED', 'legacy code preserved');
  assert.equal(classifier.SCHEMA_VALIDATION_FAILED, 'SCHEMA_VALIDATION_FAILED');
  assert.equal(classifier.NO_ELIGIBLE_PROVIDER, 'NO_ELIGIBLE_PROVIDER');
});

test('M5.7-6. failover eligibility: ONLY provider capacity/availability categories', () => {
  const c = classifier.CATEGORIES;
  for (const eligible of [c.RATE_LIMITED, c.QUOTA_EXHAUSTED, c.PROVIDER_UNAVAILABLE, c.TIMEOUT]) {
    assert.equal(classifier.isFailoverEligible(eligible), true, `${eligible} must be failover-eligible`);
  }
  for (const notEligible of [c.AUTHENTICATION_FAILED, c.INVALID_REQUEST, c.UNKNOWN, classifier.SCHEMA_VALIDATION_FAILED]) {
    assert.equal(classifier.isFailoverEligible(notEligible), false, `${notEligible} must NEVER fail over`);
  }
});

// -----------------------------------------------------------------------------
// 2. Candidate registry (providers/registry.js) — ordering and gates
// -----------------------------------------------------------------------------

test('M5.7-7. RESUME_ANALYSIS: groq is capability-blocked (default evidence: docs/15); gemini models ordered', () => {
  const candidates = registry.getCandidates('RESUME_ANALYSIS');
  assert.deepEqual(
    candidates.map((c) => `${c.provider}/${c.model}`),
    ['gemini/gemini-a', 'gemini/gemini-b', 'gemini/gemini-c'],
    'chain order: provider order then model order; groq excluded for RESUME_ANALYSIS'
  );
});

test('M5.7-8. ANSWER_EVALUATION: groq approved via AI_GROQ_CAPABILITIES → same-provider alternates BEFORE cross-provider', () => {
  const candidates = registry.getCandidates('ANSWER_EVALUATION');
  assert.deepEqual(
    candidates.map((c) => `${c.provider}/${c.model}`),
    ['gemini/gemini-a', 'gemini/gemini-b', 'gemini/gemini-c', 'groq/groq-a', 'groq/groq-b'],
    'explicit capability approval admits groq, ordered after ALL gemini models'
  );
});

test('M5.7-9. missing fallback KEY removes the provider from the chain at CALL time (no config reload)', () => {
  const previous = process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY;
  try {
    const candidates = registry.getCandidates('ANSWER_EVALUATION');
    assert.deepEqual(
      candidates.map((c) => `${c.provider}/${c.model}`),
      ['gemini/gemini-a', 'gemini/gemini-b', 'gemini/gemini-c'],
      'unconfigured fallback provider is skipped silently; primary chain intact'
    );
  } finally {
    process.env.GROQ_API_KEY = previous;
  }
});

test('M5.7-10. health cooldown gates candidacy; reset() restores it', () => {
  health.markQuotaExhausted('gemini', 'gemini-a', Date.now());
  const candidates = registry.getCandidates('RESUME_ANALYSIS');
  assert.deepEqual(candidates.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-b', 'gemini/gemini-c']);
  health.reset();
  assert.equal(registry.getCandidates('RESUME_ANALYSIS').length, 3);
});

// -----------------------------------------------------------------------------
// 3. Orchestrator chain behavior
// -----------------------------------------------------------------------------

test('M5.7-11. primary success: no failover fields, one attempt, clean AIExecution row', async () => {
  enqueue('gemini', 'gemini-a', successItem(JSON.stringify(VALID_RESUME)));
  const payload = resumePayload();
  const { result, execution } = await orchestrator.run('RESUME_ANALYSIS', payload);

  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
  assert.equal(execution.provider, 'gemini');
  assert.equal(execution.model, 'gemini-a');
  assert.equal(execution.attempts, 1);
  assert.equal(execution.candidatesTried, 1);
  assert.equal(execution.fallbackFrom, null);
  assert.equal(execution.fallbackReason, null);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].provider, 'gemini');
  assert.equal(calls[0].model, 'gemini-a');

  const rows = await rowsFor(payload.userId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'SUCCESS');
  assert.equal(rows[0].provider, 'gemini');
  assert.equal(rows[0].model, 'gemini-a');
  assert.equal(rows[0].attempt, 1);
  assert.equal(rows[0].fallbackFrom, null);
  assert.equal(rows[0].fallbackReason, null);
});

test('M5.7-12. 429 x3 on gemini-a → same-provider failover to gemini-b: backoff preserved, chain link recorded', async () => {
  enqueue('gemini', 'gemini-a', errorItem('RATE_LIMITED', 429), errorItem('RATE_LIMITED', 429), errorItem('RATE_LIMITED', 429));
  enqueue('gemini', 'gemini-b', successItem(JSON.stringify(VALID_RESUME)));
  const payload = resumePayload();
  const { result, execution } = await orchestrator.run('RESUME_ANALYSIS', payload);

  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
  assert.equal(execution.attempts, 4, '3 backoff attempts + 1 failover success');
  assert.equal(execution.candidatesTried, 2);
  assert.equal(execution.provider, 'gemini');
  assert.equal(execution.model, 'gemini-b');
  assert.equal(execution.fallbackFrom, 'gemini/gemini-a');
  assert.equal(execution.fallbackReason, 'RATE_LIMITED');
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-a', 'gemini/gemini-a', 'gemini/gemini-a', 'gemini/gemini-b']);
  // Wall-clock sampling: a real setTimeout can fire a fraction of a ms late,
  // so the gap must land INSIDE the configured backoff window, not exactly on
  // it (B1 uses node:test fake timers for exactness; here real timers prove
  // the backoff actually happens against the wall clock).
  assert.ok(calls[1].at - calls[0].at >= AI_CONFIG.rateLimitRetryDelaysMs[0] && calls[1].at - calls[0].at < AI_CONFIG.rateLimitRetryDelaysMs[0] + 500, '1st backoff ≈1s (defaults, real timers)');
  assert.ok(calls[2].at - calls[1].at >= AI_CONFIG.rateLimitRetryDelaysMs[1] && calls[2].at - calls[1].at < AI_CONFIG.rateLimitRetryDelaysMs[1] + 1000, '2nd backoff ≈2s — legacy 1s/2s/4s schedule kept');

  const rows = await rowsFor(payload.userId);
  assert.equal(rows.length, 4, 'one row per attempt');
  assert.equal(rows[0].attempt, 1);
  assert.equal(rows[0].status, 'FAILED');
  assert.equal(rows[0].errorCode, 'RATE_LIMITED');
  assert.equal(rows[0].fallbackFrom, null, 'chain head has no predecessor');
  assert.equal(rows[1].attempt, 2);
  assert.equal(rows[2].attempt, 3);
  assert.equal(rows[3].attempt, 4);
  assert.equal(rows[3].status, 'SUCCESS');
  assert.equal(rows[3].provider, 'gemini');
  assert.equal(rows[3].model, 'gemini-b');
  assert.equal(rows[3].fallbackFrom, 'gemini/gemini-a');
  assert.equal(rows[3].fallbackReason, 'RATE_LIMITED');
});

test('M5.7-13. QUOTA_EXHAUSTED fails over IMMEDIATELY — no same-candidate backoff attempt', async () => {
  enqueue('gemini', 'gemini-a', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('gemini', 'gemini-b', successItem(JSON.stringify(VALID_RESUME)));
  const payload = resumePayload();
  const { execution } = await orchestrator.run('RESUME_ANALYSIS', payload);

  assert.equal(execution.attempts, 2);
  assert.equal(execution.model, 'gemini-b');
  assert.equal(calls.length, 2, 'quota is never backoff-retried on the same candidate');
  assert.equal(calls[1].model, 'gemini-b', 'second call already on the fallback');

  const rows = await rowsFor(payload.userId);
  assert.equal(rows[0].errorCode, 'QUOTA_EXHAUSTED');
  assert.equal(rows[1].fallbackFrom, 'gemini/gemini-a');
  assert.equal(rows[1].fallbackReason, 'QUOTA_EXHAUSTED');
});

test('M5.7-14. cross-provider failover: all three gemini models quota → groq-a succeeds', async () => {
  enqueue('gemini', 'gemini-a', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('gemini', 'gemini-b', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('gemini', 'gemini-c', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('groq', 'groq-a', successItem(JSON.stringify(VALID_ANSWER)));
  const payload = answerPayload();
  const { result, execution } = await orchestrator.run('ANSWER_EVALUATION', payload);

  assert.deepEqual(result, sanitizeAnswerEvaluation(VALID_ANSWER));
  assert.equal(execution.provider, 'groq');
  assert.equal(execution.model, 'groq-a');
  assert.equal(execution.attempts, 4);
  assert.equal(execution.candidatesTried, 4);
  assert.equal(execution.fallbackFrom, 'gemini/gemini-c');
  assert.equal(execution.fallbackReason, 'QUOTA_EXHAUSTED');
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-a', 'gemini/gemini-b', 'gemini/gemini-c', 'groq/groq-a']);

  const rows = await rowsFor(payload.userId);
  assert.equal(rows.length, 4);
  assert.equal(rows[2].fallbackFrom, 'gemini/gemini-b', 'mid-chain row carries the link it came from');
  assert.equal(rows[3].status, 'SUCCESS');
  assert.equal(rows[3].provider, 'groq');
  assert.equal(rows[3].model, 'groq-a');
  assert.equal(rows[3].fallbackFrom, 'gemini/gemini-c');
  assert.equal(rows[3].fallbackReason, 'QUOTA_EXHAUSTED');
});

test('M5.7-15. attempt budget (AI_MAX_TOTAL_ATTEMPTS=4) is a HARD cap across the whole chain: groq-b never called', async () => {
  for (const [provider, model] of [['gemini', 'gemini-a'], ['gemini', 'gemini-b'], ['gemini', 'gemini-c'], ['groq', 'groq-a'], ['groq', 'groq-b']]) {
    enqueue(provider, model, errorItem('QUOTA_EXHAUSTED', 429));
  }
  const payload = answerPayload();
  await assert.rejects(
    orchestrator.run('ANSWER_EVALUATION', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'QUOTA_EXHAUSTED' && err.details.attempts === 4 && err.details.candidatesTried === 4
  );
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-a', 'gemini/gemini-b', 'gemini/gemini-c', 'groq/groq-a']);
  const rows = await rowsFor(payload.userId);
  assert.equal(rows.length, 4, 'four FAILED rows, one per attempt, chain fully reconstructible');
  assert.equal(rows[3].attempt, 4, 'the terminal row is persisted deterministically before the run rejects');
  assert.equal(rows[3].fallbackFrom, 'gemini/gemini-c', 'the candidate the chain reached groq-a from');
  assert.equal(rows[3].fallbackReason, 'QUOTA_EXHAUSTED');
  assert.equal(rows[3].status, 'FAILED');
  assert.equal(rows[3].errorCode, 'QUOTA_EXHAUSTED');
});

test('M5.7-16. backoff + failover share ONE budget: 429s spent on the primary leave no room for the fallback', async () => {
  // Each candidate allows up to 3 attempts (1 + 2 backoffs, docs/07 §5);
  // with budget 4 the primary's 3 backoff attempts consume 3, leaving room
  // for exactly one call on the next candidate before the cap stops the run.
  enqueue('gemini', 'gemini-a', errorItem('RATE_LIMITED', 429), errorItem('RATE_LIMITED', 429), errorItem('RATE_LIMITED', 429));
  enqueue('gemini', 'gemini-b', errorItem('RATE_LIMITED', 429));
  enqueue('gemini', 'gemini-c', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('groq', 'groq-a', successItem(JSON.stringify(VALID_ANSWER)));
  enqueue('groq', 'groq-b', successItem(JSON.stringify(VALID_ANSWER)));
  const payload = answerPayload();
  await assert.rejects(
    orchestrator.run('ANSWER_EVALUATION', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'RATE_LIMITED' && err.details.attempts === 4 && err.details.candidatesTried === 2
  );
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), [
    'gemini/gemini-a',
    'gemini/gemini-a',
    'gemini/gemini-a',
    'gemini/gemini-b',
  ]);
  assert.equal(calls.length, 4, 'budget spent before gemini-c/groq — a spent budget ends the operation with candidates left');
});

test('M5.7-17. schema-correction retry stays on the SAME candidate — no provider switch for contract quality', async () => {
  const invalid = JSON.stringify({ ...VALID_RESUME, extractedSkills: 'not-an-array' });
  enqueue('gemini', 'gemini-a', successItem(invalid), successItem(JSON.stringify(VALID_RESUME)));
  const payload = resumePayload();
  const { result, execution } = await orchestrator.run('RESUME_ANALYSIS', payload);

  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
  assert.equal(execution.attempts, 2);
  assert.equal(execution.correctionsUsed, 1);
  assert.equal(execution.model, 'gemini-a');
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-a', 'gemini/gemini-a']);
});

test('M5.7-18. SCHEMA_VALIDATION_FAILED is final and NEVER fails over (AGENTS.md rule 2)', async () => {
  const invalid = JSON.stringify({ ...VALID_RESUME, experienceSummary: '' });
  enqueue('gemini', 'gemini-a', successItem(invalid), successItem(invalid));
  const payload = resumePayload();
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'SCHEMA_VALIDATION_FAILED' && err.details.attempts === 2
  );
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-a', 'gemini/gemini-a']);
  const rows = await rowsFor(payload.userId);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].errorCode, 'SCHEMA_VALIDATION_FAILED');
});

test('M5.7-19. INVALID_REQUEST (400) is an application defect — immediate final failure, no switch', async () => {
  enqueue('gemini', 'gemini-a', errorItem('INVALID_REQUEST', 400));
  const payload = resumePayload();
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'AI_PROVIDER_FAILED' && err.details.attempts === 1
  );
  assert.equal(calls.length, 1, 'exactly one attempt, never retried and never failed over');
});

test('M5.7-20. AUTHENTICATION_FAILED never fails over — a bad credential would hide behind every provider', async () => {
  enqueue('gemini', 'gemini-a', errorItem('AUTHENTICATION_FAILED', 401));
  enqueue('groq', 'groq-a', successItem(JSON.stringify(VALID_ANSWER)));
  const payload = answerPayload();
  await assert.rejects(
    orchestrator.run('ANSWER_EVALUATION', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'AUTHENTICATION_FAILED' && err.details.attempts === 1
  );
  assert.equal(calls.length, 1, 'groq was never tried — auth defects are routed to the operator, not the next provider');
});

test('M5.7-21. capability gate holds under exhaustion: RESUME_ANALYSIS cannot fall back to groq at all', async () => {
  enqueue('gemini', 'gemini-a', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('gemini', 'gemini-b', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('gemini', 'gemini-c', errorItem('QUOTA_EXHAUSTED', 429));
  const payload = resumePayload();
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'QUOTA_EXHAUSTED' && err.details.attempts === 3
  );
  assert.deepEqual(calls.map((c) => `${c.provider}/${c.model}`), ['gemini/gemini-a', 'gemini/gemini-b', 'gemini/gemini-c']);
});

test('M5.7-22. NO_ELIGIBLE_PROVIDER: cooldown on every eligible candidate → typed failure, zero provider calls', async () => {
  const now = Date.now();
  for (const model of ['gemini-a', 'gemini-b', 'gemini-c']) health.markQuotaExhausted('gemini', model, now);
  const payload = resumePayload();
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', payload),
    (err) => err instanceof AIProviderError && err.details.failure === 'NO_ELIGIBLE_PROVIDER' && err.details.attempts === 0
  );
  assert.equal(calls.length, 0, 'no provider call is made when no candidate is eligible');
  const rows = await rowsFor(payload.userId);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].errorCode, 'NO_ELIGIBLE_PROVIDER');
  assert.equal(rows[0].status, 'FAILED');
});

test('M5.7-23. health cooldown changes the NEXT request pact candidacy: exhausted primary is skipped', async () => {
  enqueue('gemini', 'gemini-a', errorItem('QUOTA_EXHAUSTED', 429));
  enqueue('gemini', 'gemini-b', successItem(JSON.stringify(VALID_RESUME)));
  enqueue('gemini', 'gemini-b', successItem(JSON.stringify(VALID_RESUME)));
  const payload1 = resumePayload();
  const payload2 = resumePayload();
  await orchestrator.run('RESUME_ANALYSIS', payload1);
  const { execution: exec2 } = await orchestrator.run('RESUME_ANALYSIS', payload2);

  assert.equal(exec2.provider, 'gemini');
  assert.equal(exec2.model, 'gemini-b', 'second request starts on the fallback — gemini-a is in cooldown');
  assert.equal(exec2.attempts, 1);
  assert.equal(calls[0].model, 'gemini-a', 'first request: primary tried');
  assert.equal(calls[1].model, 'gemini-b');
  assert.equal(calls[2].model, 'gemini-b', 'second request never calls gemini-a');
});

test('M5.7-24. herd test: concurrent requests all switch on the same exhausted candidate without unbounded calls', async () => {
  for (let i = 0; i < 3; i += 1) {
    enqueue('gemini', 'gemini-a', errorItem('QUOTA_EXHAUSTED', 429));
    enqueue('gemini', 'gemini-b', successItem(JSON.stringify(VALID_RESUME)));
  }
  const payloads = [resumePayload(), resumePayload(), resumePayload()];
  const executions = (await Promise.all(payloads.map((p) => orchestrator.run('RESUME_ANALYSIS', p)))).map((r) => r.execution);

  assert.equal(calls.length, 6, '3 runs x (1 primary + 1 fallback) — nothing fanning out further');
  for (const execution of executions) {
    assert.equal(execution.model, 'gemini-b');
    assert.equal(execution.fallbackReason, 'QUOTA_EXHAUSTED');
  }
});

// -----------------------------------------------------------------------------
// 4. Hard invariants
// -----------------------------------------------------------------------------

test('M5.7-25. no API key appears in any src file — gemini or groq test key', () => {
  const keys = [process.env.GEMINI_API_KEY, process.env.GROQ_API_KEY];
  const srcDir = path.join(__dirname, '..', 'src');
  const offenders = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js') && keys.some((key) => fs.readFileSync(full, 'utf8').includes(key))) {
        offenders.push(path.relative(srcDir, full));
      }
    }
  })(srcDir);
  assert.deepEqual(offenders, [], 'test API keys must not appear in any src file');
});

test('M5.7-26. the Gemini SDK is imported by exactly one file, and only adapter modules by the registry', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const sdk = [];
  const adapters = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8');
        if (/require\(\s*['"][^'"]*@google\/generative-ai['"]\s*\)/.test(content)) {
          sdk.push(path.relative(srcDir, full));
        }
        if (/require\(\s*['"](?:\.\/gemini|\.\/groq)['"]\s*\)/.test(content)) {
          adapters.push(path.relative(srcDir, full));
        }
      }
    }
  })(srcDir);
  assert.deepEqual(sdk.sort(), ['ai/providers/gemini.js']);
  assert.deepEqual(adapters.sort(), ['ai/providers/registry.js'], 'only the registry may require the adapters (relative form)');
});

test('M5.7-27. M5.7 implementation files exist and the milestone contract doc is referenced by ROADMAP', () => {
  const files = [
    'server/src/ai/providers/registry.js',
    'server/src/ai/providers/classify.js',
    'server/src/ai/health.js',
    'docs/16-ai-failover.md',
  ];
  const root = path.join(__dirname, '..', '..');
  for (const file of files) {
    assert.ok(fs.existsSync(path.join(root, file)), `${file} must exist for M5.7`);
  }
  assert.ok(fs.readFileSync(path.join(root, 'ROADMAP.md'), 'utf8').includes('M5.7'), 'ROADMAP must carry the M5.7 milestone');
});