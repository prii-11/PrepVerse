// M5.1 AI infrastructure tests (docs/07 §5 retry policy, M5.1 §23 requirements
// A-J). No real Gemini calls — the provider is mocked deterministically.
// Uses node:test (built-in) + mongodb-memory-server (existing devDependency)
// so the AIExecution persistence claims are proven against an actual database.
//
// Environment note: config/env.js fail-fasts at require time on missing
// startup vars and config/ai.js throws without GEMINI_API_KEY — set all of
// them before any module require below.
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const { AI_CONFIG } = require('../src/config/ai');
const orchestrator = require('../src/ai/orchestrator');
const geminiProvider = require('../src/ai/providers/gemini');
const AIExecution = require('../src/ai/aiExecution.model');
const { AIProviderError } = require('../src/utils/errors');
const { resumeAnalysisSchema, sanitizeResumeAnalysis } = require('../src/ai/schemas/resumeAnalysis.schema');
const { createQuestionGenerationSchema, sanitizeQuestionGeneration } = require('../src/ai/schemas/questionGeneration.schema');
const { createAnswerEvaluationSchema, sanitizeAnswerEvaluation } = require('../src/ai/schemas/answerEvaluation.schema');

let mongoServer;
const realGenerate = geminiProvider.generate;

// ---- deterministic provider mock ------------------------------------------

const mock = (() => {
  let queue = [];
  const calls = [];
  return {
    get calls() {
      return calls;
    },
    enqueue(...items) {
      queue = queue.concat(items);
    },
    reset() {
      queue = [];
      calls.length = 0;
    },
    install() {
      geminiProvider.generate = async (prompt) => {
        const item = queue.shift();
        const at = Date.now();
        calls.push({ prompt, at, kind: item?.kind });
        if (item && item.kind === 'success') {
          return { text: item.text, latencyMs: 1, tokenUsage: item.tokenUsage };
        }
        throw new AIProviderError('mock upstream failure', {
          retryable: item?.kind === 'retryable',
          upstreamStatus: item?.kind === 'retryable' ? 429 : 500,
        });
      };
    },
    restore() {
      geminiProvider.generate = realGenerate;
    },
  };
})();

const successItem = (text, tokenUsage = { input: 10, output: 5 }) => ({ kind: 'success', text, tokenUsage });
const retryableItem = () => ({ kind: 'retryable' });
const failureItem = () => ({ kind: 'failure' });

// ---- fixtures ---------------------------------------------------------------

const VALID_RESUME = {
  extractedSkills: ['javascript', 'nodejs'],
  experienceSummary: '5 years building web applications and APIs.',
  projects: [{ name: 'PrepVerse', description: 'Mock interview platform', technologies: ['nodejs'] }],
  strengths: ['API design'],
  skillGaps: ['kubernetes'],
};

const VALID_QUESTION = {
  questions: [
    {
      id: 'q1',
      text: 'What is a MongoDB index?',
      category: 'databases',
      difficulty: 'medium',
      expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }],
    },
    {
      id: 'q2',
      text: 'Explain database transactions.',
      category: 'databases',
      difficulty: 'hard',
      expectedTopics: [{ skillKey: 'mongodb', topic: 'transactions' }],
    },
  ],
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

function resumePayload(prompt = 'Analyze this resume. Target role: Backend Developer') {
  return {
    userId: new mongoose.Types.ObjectId().toString(),
    entityId: new mongoose.Types.ObjectId().toString(),
    prompt,
    input: { resumeText: 'sample resume text', targetRole: 'Backend Developer', experienceLevel: 'Entry' },
  };
}

// ---- DB lifecycle -----------------------------------------------------------

test.before(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
});

test.after(async () => {
  mock.restore();
  await mongoose.disconnect();
  await mongoServer.stop();
});

test.beforeEach(() => {
  mock.reset();
  mock.install();
});

// -----------------------------------------------------------------------------
// I. Environment configuration — key from env, never hardcoded
// -----------------------------------------------------------------------------

test('I. GEMINI_API_KEY comes from the environment, not source', () => {
  assert.equal(AI_CONFIG.GEMINI_API_KEY, process.env.GEMINI_API_KEY);
  const srcDir = path.join(__dirname, '..', 'src');
  const files = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) files.push(full);
    }
  })(srcDir);
  const offenders = files.filter((file) => fs.readFileSync(file, 'utf8').includes(process.env.GEMINI_API_KEY));
  assert.deepEqual(offenders, [], 'the test API key must not appear in any src file');
});

// -----------------------------------------------------------------------------
// A. Provider isolation — only orchestrator.js touches the Gemini provider/SDK
// -----------------------------------------------------------------------------

test('A. only orchestrator.js imports the Gemini provider', () => {
  const srcDir = path.join(__dirname, '..', 'src');
  const importers = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const content = fs.readFileSync(full, 'utf8');
        // Match actual require() targets, not path strings appearing in comments.
        const hasProviderImport = /require\(\s*['"][^'"]*providers\/gemini['"]\s*\)/.test(content);
        const hasSdkImport = /require\(\s*['"][^'"]*@google\/generative-ai['"]\s*\)/.test(content);
        if (hasProviderImport || hasSdkImport) importers.push(path.relative(srcDir, full));
      }
    }
  })(srcDir);
  assert.deepEqual(
    importers.sort(),
    ['ai/orchestrator.js', 'ai/providers/gemini.js'],
    'the Gemini SDK must live in providers/gemini.js and be imported only by the orchestrator'
  );
});

// -----------------------------------------------------------------------------
// B. 429 retry/backoff
// -----------------------------------------------------------------------------

test('B1. 429 → 429 → success: exactly 3 attempts with configured backoff', async () => {
  const originalDelays = AI_CONFIG.rateLimitRetryDelaysMs;
  AI_CONFIG.rateLimitRetryDelaysMs = [10, 25, 99999];
  mock.enqueue(retryableItem(), retryableItem(), successItem(JSON.stringify(VALID_RESUME)));

  const { result, execution } = await orchestrator.run('RESUME_ANALYSIS', resumePayload());

  assert.equal(mock.calls.length, 3, 'must make exactly 3 provider calls');
  assert.equal(execution.attempts, 3);
  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
  const [c1, c2, c3] = mock.calls;
  assert.equal(c1.kind, 'retryable');
  assert.equal(c2.kind, 'retryable');
  assert.equal(c3.kind, 'success');
  assert.ok(c2.at - c1.at >= 10, 'wait 1s-equivalent before attempt 2 (uses rateLimitRetryDelaysMs[0])');
  assert.ok(c3.at - c2.at >= 25, 'wait 2s-equivalent before attempt 3 (uses rateLimitRetryDelaysMs[1])');

  AI_CONFIG.rateLimitRetryDelaysMs = originalDelays;
});

test('B2. production default backoff is 1s/2s/4s, max 3 attempts', () => {
  assert.deepEqual(AI_CONFIG.rateLimitRetryDelaysMs, [1000, 2000, 4000]);
  assert.equal(AI_CONFIG.maxAttempts, 3);
});

test('B3. 429 → 429 → 429: 3 attempts then typed AI-provider failure (RATE_LIMITED)', async () => {
  mock.enqueue(retryableItem(), retryableItem(), retryableItem());
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', resumePayload()),
    (err) => {
      assert.ok(err instanceof AIProviderError);
      assert.equal(err.details.failure, 'RATE_LIMITED');
      assert.equal(err.details.attempts, 3);
      assert.equal(err.statusCode, 502);
      assert.notEqual(err.code, 'RATE_LIMIT_EXCEEDED', 'must NOT be the app RateLimitError');
      return true;
    }
  );
  assert.equal(mock.calls.length, 3, 'exactly 3 attempts, never retried indefinitely');
});

test('B4. non-429 provider failure is not retried', async () => {
  mock.enqueue(failureItem());
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', resumePayload()),
    (err) => err instanceof AIProviderError && err.details.failure === 'AI_PROVIDER_FAILED'
  );
  assert.equal(mock.calls.length, 1, 'non-429 errors are never retried');
});

// -----------------------------------------------------------------------------
// C. Schema/JSON correction retry — exactly once
// -----------------------------------------------------------------------------

test('C1. invalid → valid corrected: exactly 2 attempts, correction prompt used', async () => {
  const invalid = JSON.stringify({ ...VALID_RESUME, extractedSkills: 'not-an-array' });
  mock.enqueue(successItem(invalid), successItem(JSON.stringify(VALID_RESUME)));

  const { result, execution } = await orchestrator.run('RESUME_ANALYSIS', resumePayload());

  assert.equal(mock.calls.length, 2, 'exactly 2 total AI attempts for schema retry');
  assert.equal(execution.attempts, 2);
  assert.equal(execution.correctionsUsed, 1);
  assert.ok(mock.calls[1].prompt.includes('did not match the required schema'), '2nd call carries the correction prompt');
  assert.ok(mock.calls[1].prompt.includes('extractedSkills'), 'correction prompt embeds the contract shape');
  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
});

test('C2. invalid → invalid: 2 attempts then hard failure', async () => {
  const invalid = JSON.stringify({ ...VALID_RESUME, experienceSummary: '' });
  mock.enqueue(successItem(invalid), successItem(invalid));

  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', resumePayload()),
    (err) => err instanceof AIProviderError && err.details.failure === 'SCHEMA_VALIDATION_FAILED' && err.details.attempts === 2
  );
  assert.equal(mock.calls.length, 2, '2 attempts then hard failure, not 3');
});

test('C3. unparseable (non-JSON) output follows the same single-correction path', async () => {
  mock.enqueue(successItem('not json at all {{{'), successItem(JSON.stringify(VALID_RESUME)));
  const { result } = await orchestrator.run('RESUME_ANALYSIS', resumePayload());
  assert.equal(mock.calls.length, 2);
  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
});

test('C4. JSON wrapped in markdown fences and whitespace is normalized', async () => {
  mock.enqueue(successItem('  \n```json\n' + JSON.stringify(VALID_RESUME, null, 2) + '\n```\n  '));
  const { result } = await orchestrator.run('RESUME_ANALYSIS', resumePayload());
  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));
});

// -----------------------------------------------------------------------------
// D. Invalid AI values fail validation — never silently coerced
// -----------------------------------------------------------------------------

test('D1. correctness 105 is a schema failure that never becomes 100', async () => {
  const invalid = JSON.stringify({ ...VALID_ANSWER, correctness: 105 });
  const valid = JSON.stringify(VALID_ANSWER);
  mock.enqueue(successItem(invalid), successItem(valid));

  const payload = {
    userId: new mongoose.Types.ObjectId().toString(),
    entityId: new mongoose.Types.ObjectId().toString(),
    prompt: 'Evaluate this answer.',
    input: {
      question: { text: 'What is an index?', category: 'databases', difficulty: 'medium', expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }] },
      candidateAnswer: 'An index speeds up lookups.',
      candidateProfile: { targetRole: 'Backend Developer', experienceLevel: 'Entry' },
    },
  };
  const { result } = await orchestrator.run('ANSWER_EVALUATION', payload);

  assert.equal(mock.calls.length, 2, '105 enters the correction-retry path');
  assert.equal(result.correctness, 80, 'valid corrected value accepted');
  assert.ok(result.correctness !== 100, '105 was never clamped to 100');
});

test('D2. out-of-range score that stays invalid: hard failure, never clamped', async () => {
  const invalid = JSON.stringify({ ...VALID_ANSWER, technicalDepth: 200 });
  mock.enqueue(successItem(invalid), successItem(invalid));
  await assert.rejects(
    orchestrator.run('ANSWER_EVALUATION', {
      userId: new mongoose.Types.ObjectId().toString(),
      prompt: 'Evaluate.',
      input: {
        question: { expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }] },
        candidateAnswer: 'x',
      },
    }),
    (err) => err instanceof AIProviderError && err.details.failure === 'SCHEMA_VALIDATION_FAILED'
  );
  assert.equal(mock.calls.length, 2);
});

// -----------------------------------------------------------------------------
// E. Post-validation sanitization (only on schema-valid values)
// -----------------------------------------------------------------------------

test('E1. schema-valid over-limit values are truncated/capped by sanitize, not rejected', async () => {
  const longSummary = 'x'.repeat(600);
  const manyStrengths = Array.from({ length: 12 }, (_, i) => `strength ${i}`);
  mock.enqueue(successItem(JSON.stringify({ ...VALID_RESUME, experienceSummary: longSummary, strengths: manyStrengths })));

  const { result } = await orchestrator.run('RESUME_ANALYSIS', resumePayload());

  assert.equal(result.experienceSummary.length, 500, 'strings truncated to documented cap');
  assert.equal(result.strengths.length, 8, 'arrays capped to documented max');
});

test('E2. sanitize is a no-op on already-valid values (idempotent)', () => {
  assert.deepEqual(sanitizeResumeAnalysis(VALID_RESUME), VALID_RESUME);
  assert.deepEqual(sanitizeAnswerEvaluation(VALID_ANSWER), VALID_ANSWER);
  assert.deepEqual(sanitizeQuestionGeneration(VALID_QUESTION), VALID_QUESTION);
});

// -----------------------------------------------------------------------------
// F/G/H. AIExecution logging — success, failure, sanitized outputSummary
// -----------------------------------------------------------------------------

test('F. successful run persists AIExecution status SUCCESS with metadata', async () => {
  mock.enqueue(successItem(JSON.stringify(VALID_RESUME), { input: 120, output: 40 }));
  const payload = resumePayload();
  const { result } = await orchestrator.run('RESUME_ANALYSIS', payload);
  assert.deepEqual(result, sanitizeResumeAnalysis(VALID_RESUME));

  const log = await AIExecution.findOne({ userId: payload.userId }).lean();
  assert.ok(log, 'an AIExecution doc must exist');
  assert.equal(log.operation, 'RESUME_ANALYSIS');
  assert.equal(log.entityType, 'RESUME');
  assert.equal(String(log.entityId), payload.entityId);
  assert.equal(log.status, 'SUCCESS');
  assert.equal(log.provider, 'gemini');
  assert.equal(log.model, AI_CONFIG.model);
  assert.equal(log.promptVersion, 'resume-analysis-v1');
  assert.equal(log.tokenUsage.input, 120);
  assert.equal(log.tokenUsage.output, 40);
  assert.equal(log.errorCode, undefined);
  assert.ok(log.outputSummary.validationPassed === true);
  assert.equal(log.outputSummary.extractedSkillsCount, 2);
});

test('G. exhausted retries persist AIExecution status FAILED with errorCode', async () => {
  mock.enqueue(retryableItem(), retryableItem(), retryableItem());
  const payload = resumePayload();
  await assert.rejects(orchestrator.run('RESUME_ANALYSIS', payload));

  const log = await AIExecution.findOne({ userId: payload.userId, status: 'FAILED' }).lean();
  assert.ok(log, 'a FAILED AIExecution doc must exist');
  assert.equal(log.errorCode, 'RATE_LIMITED');
  assert.equal(log.status, 'FAILED');
  assert.equal(log.operation, 'RESUME_ANALYSIS');
  assert.equal(log.outputSummary.validationPassed, false);
  assert.equal(log.outputSummary.errorCode, 'RATE_LIMITED');
});

test('H. outputSummary never persists sensitive content', async () => {
  const secret = 'sk-FAKE-SECRET-9f8e7d6c5b4a';
  const resumeText = 'John Doe\n555-0100\njohn@example.com\nWorked at Acme Corp on a payments system handling $10M/yr.';
  const prompt = `Analyze this resume.\n\n<resume>\n${resumeText}\n</resume>\n\nMy API key is ${secret} — remember it.`;
  mock.enqueue(successItem(JSON.stringify(VALID_RESUME)));

  const payload = resumePayload(prompt);
  await orchestrator.run('RESUME_ANALYSIS', payload);

  const log = await AIExecution.findOne({ userId: payload.userId }).lean();
  assert.ok(log);
  const serialized = JSON.stringify(log);
  for (const sensitive of [secret, resumeText, 'John Doe', '555-0100', 'john@example.com', 'Acme Corp', prompt]) {
    assert.ok(!serialized.includes(sensitive), `AIExecution must not contain: ${sensitive.slice(0, 30)}`);
  }
  assert.equal(log.outputSummary.validationPassed, true);
  assert.ok(!('prompt' in log), 'the prompt itself is never persisted');
  assert.ok(!('text' in log.outputSummary), 'unrestricted Gemini output is never persisted');
});

// -----------------------------------------------------------------------------
// J. No domain mutation — orchestrator only writes AIExecution
// -----------------------------------------------------------------------------

test('J. running the orchestrator does not touch users/resumes/interviews', async () => {
  mock.enqueue(successItem(JSON.stringify(VALID_RESUME)));
  await orchestrator.run('RESUME_ANALYSIS', resumePayload());

  const db = mongoose.connection.db;
  const usersBefore = await db.collection('users').countDocuments();
  const resumesBefore = await db.collection('resumes').countDocuments();
  const interviewsBefore = await db.collection('interviews').countDocuments();
  const executions = await db.collection('aiexecutions').countDocuments();

  assert.equal(usersBefore, 0, 'User collection untouched');
  assert.equal(resumesBefore, 0, 'Resume collection untouched');
  assert.equal(interviewsBefore, 0, 'Interview collection untouched');
  assert.ok(executions >= 1, 'only AIExecution audit records are written');
});

// -----------------------------------------------------------------------------
// Orchestrator contract guards
// -----------------------------------------------------------------------------

test('unknown operation is rejected before any provider call', async () => {
  await assert.rejects(
    orchestrator.run('NOT_AN_OPERATION', resumePayload()),
    (err) => err.code === 'VALIDATION_ERROR'
  );
  assert.equal(mock.calls.length, 0);
});

test('payload without userId is rejected', async () => {
  const { userId, ...rest } = resumePayload();
  await assert.rejects(orchestrator.run('RESUME_ANALYSIS', rest), (err) => err.code === 'VALIDATION_ERROR');
  assert.equal(mock.calls.length, 0);
});

test('QUESTION_GENERATION enforces exact questionCount from the input contract', async () => {
  const valid = JSON.stringify({ ...VALID_QUESTION, questions: VALID_QUESTION.questions.slice(0, 1) });
  const corrected = JSON.stringify(VALID_QUESTION);
  mock.enqueue(successItem(valid), successItem(corrected));

  const { result, execution } = await orchestrator.run('QUESTION_GENERATION', {
    userId: new mongoose.Types.ObjectId().toString(),
    prompt: 'Generate 2 questions.',
    input: { targetRole: 'Backend Developer', difficulty: 'medium', questionCount: 2 },
  });
  assert.equal(mock.calls.length, 2, 'wrong count → correction retry (docs/07 §3)');
  assert.equal(result.questions.length, 2);
  assert.equal(execution.correctionsUsed, 1);
});

test('ANSWER_EVALUATION rejects topicAssessments outside expectedTopics', async () => {
  const bad = JSON.stringify({ ...VALID_ANSWER, topicAssessments: [{ skillKey: 'redis', addressed: true, quality: 'good' }] });
  const corrected = JSON.stringify(VALID_ANSWER);
  mock.enqueue(successItem(bad), successItem(corrected));

  const { result } = await orchestrator.run('ANSWER_EVALUATION', {
    userId: new mongoose.Types.ObjectId().toString(),
    prompt: 'Evaluate.',
    input: {
      question: { expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }] },
      candidateAnswer: 'x',
    },
  });
  assert.equal(mock.calls.length, 2, 'subset violation → correction retry');
  assert.equal(result.topicAssessments[0].skillKey, 'mongodb');
});

// -----------------------------------------------------------------------------
// Schema unit tests (docs/07 §3/§4 rules encoded where possible)
// -----------------------------------------------------------------------------

test('question generation schema: duplicate text rejected, difficulty enum enforced', () => {
  const schema = createQuestionGenerationSchema(2);
  const dupes = { questions: [VALID_QUESTION.questions[0], { ...VALID_QUESTION.questions[1], text: 'what is a MongoDB index?' }] };
  const dupRes = schema.safeParse(dupes);
  assert.equal(dupRes.success, false, 'case-insensitive duplicate text is rejected');

  const badEnum = { questions: [VALID_QUESTION.questions[0], { ...VALID_QUESTION.questions[1], difficulty: 'impossible' }] };
  assert.equal(schema.safeParse(badEnum).success, false, 'unknown difficulty rejected');

  const badCategory = { questions: [VALID_QUESTION.questions[0], { ...VALID_QUESTION.questions[1], category: '' }] };
  assert.equal(schema.safeParse(badCategory).success, false, 'empty category rejected (non-empty string)');
});

test('answer evaluation schema: uniqueness + non-empty-when-expectedTopics', () => {
  const schema = createAnswerEvaluationSchema([{ skillKey: 'mongodb', topic: 'indexes' }]);
  const dup = { ...VALID_ANSWER, topicAssessments: [
    { skillKey: 'mongodb', addressed: true, quality: 'good' },
    { skillKey: 'mongodb', addressed: false, quality: 'weak' },
  ]};
  assert.equal(schema.safeParse(dup).success, false, 'duplicate skillKey is a validation failure');

  const empty = { ...VALID_ANSWER, topicAssessments: [] };
  assert.equal(schema.safeParse(empty).success, false, 'topicAssessments must be non-empty when expectedTopics non-empty');
});
