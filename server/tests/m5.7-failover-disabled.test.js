// M5.7 failover-disabled proof (docs/16-ai-failover.md §5/§12). ai.js reads
// the environment ONCE at require time, so a distinct process is required to
// observe AI_FAILOVER_ENABLED=false: the chain collapses to the first
// candidate and every pre-M5.7 contract (429 backoff max 3, non-429 typed
// failure, correction path, quota-without-fallback) is byte-identical to the
// single-provider behavior pinned by the m5.1 suite.
//
// Env note: keys and caps are set so a fallback WOULD be eligible — only
// AI_FAILOVER_ENABLED=false keeps the operation on the primary. Cooldowns are
// 0 because with a single candidate, marks are supposed to be inert.
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';
process.env.GROQ_API_KEY = 'test-groq-api-key-12345';
process.env.AI_PROVIDER_CHAIN = 'gemini,groq';
process.env.AI_GEMINI_MODELS = 'gemini-a,gemini-b';
process.env.AI_GROQ_MODELS = 'groq-a';
process.env.AI_GROQ_CAPABILITIES = 'RESUME_ANALYSIS';
process.env.AI_FAILOVER_ENABLED = 'false';
process.env.AI_QUOTA_COOLDOWN_MS = '0';
process.env.AI_RATE_LIMIT_COOLDOWN_MS = '0';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { AI_CONFIG } = require('../src/config/ai');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const orchestrator = require('../src/ai/orchestrator');
const { AIProviderError } = require('../src/utils/errors');
const AIExecution = require('../src/ai/aiExecution.model');
const registry = require('../src/ai/providers/registry');
const geminiProvider = require('../src/ai/providers/gemini');

const realGeminiGenerate = geminiProvider.generate;
const queue = [];
const calls = [];

const VALID_RESUME = {
  extractedSkills: ['javascript', 'nodejs'],
  experienceSummary: '5 years building web applications and APIs.',
  projects: [{ name: 'PrepVerse', description: 'Mock interview platform', technologies: ['nodejs'] }],
  strengths: ['API design'],
  skillGaps: ['kubernetes'],
};

function resumePayload(prompt = 'Analyze this resume. Target role: Backend Developer') {
  return {
    userId: new mongoose.Types.ObjectId().toString(),
    entityId: new mongoose.Types.ObjectId().toString(),
    prompt,
    input: { resumeText: 'sample resume text', targetRole: 'Backend Developer', experienceLevel: 'Entry' },
  };
}

let mongoServer;

test.before(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  geminiProvider.generate = async (prompt) => {
    const item = queue.shift();
    calls.push(item?.kind ?? 'unexpected');
    if (item && item.kind === 'success') return { text: item.text, latencyMs: 1, tokenUsage: item.tokenUsage };
    if (item && item.kind === 'error') {
      throw new AIProviderError('mock upstream failure', {
        category: item.category,
        upstreamStatus: item.upstreamStatus,
        retryable: item.category === 'RATE_LIMITED' || item.category === 'QUOTA_EXHAUSTED',
      });
    }
    throw new Error('mock: unexpected call');
  };
});

test.after(async () => {
  geminiProvider.generate = realGeminiGenerate;
  await mongoose.disconnect();
  await mongoServer.stop();
});

test.beforeEach(() => {
  queue.length = 0;
  calls.length = 0;
});

test('D1. failoverEnabled=false: registry still offers the full chain; the ORCHESTRATOR collapses to candidate 1', () => {
  assert.equal(AI_CONFIG.failoverEnabled, false, 'env must be honored at require time');
  const candidates = registry.getCandidates('RESUME_ANALYSIS');
  assert.deepEqual(
    candidates.map((c) => `${c.provider}/${c.model}`),
    ['gemini/gemini-a', 'gemini/gemini-b', 'groq/groq-a'],
    'candidacy is not restricted — the collapse is an orchestrator-level decision (D2–D5 prove single-candidate behavior)'
  );
});

test('D2. quota on the primary with NO fallback: 1 attempt, typed QUOTA_EXHAUSTED, no provider switch', async () => {
  queue.push({ kind: 'error', category: 'QUOTA_EXHAUSTED', upstreamStatus: 429 });
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', resumePayload()),
    (err) => err instanceof AIProviderError && err.details.failure === 'QUOTA_EXHAUSTED' && err.details.attempts === 1
  );
  assert.equal(calls.length, 1, 'a single-candidate chain never calls anything else');
});

test('D3. 429 backoff preserved under collapse: 3 attempts then RATE_LIMITED failure (B3 semantics)', async () => {
  queue.push(
    { kind: 'error', category: 'RATE_LIMITED', upstreamStatus: 429 },
    { kind: 'error', category: 'RATE_LIMITED', upstreamStatus: 429 },
    { kind: 'error', category: 'RATE_LIMITED', upstreamStatus: 429 }
  );
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', resumePayload()),
    (err) => err instanceof AIProviderError && err.details.failure === 'RATE_LIMITED' && err.details.attempts === 3
  );
  assert.equal(calls.length, 3);
});

test('D4. non-429 under collapse: 1 attempt, AI_PROVIDER_FAILED (B4 semantics)', async () => {
  queue.push({ kind: 'error', category: 'PROVIDER_UNAVAILABLE', upstreamStatus: 503 });
  await assert.rejects(
    orchestrator.run('RESUME_ANALYSIS', resumePayload()),
    (err) => err instanceof AIProviderError && err.details.failure === 'AI_PROVIDER_FAILED' && err.details.attempts === 1
  );
  assert.equal(calls.length, 1);
});

test('D5. correction path preserved under collapse: single-candidate invalid → valid', async () => {
  const invalid = JSON.stringify({ ...VALID_RESUME, extractedSkills: 'not-an-array' });
  queue.push(
    { kind: 'success', text: invalid },
    { kind: 'success', text: JSON.stringify(VALID_RESUME) }
  );
  const { execution } = await orchestrator.run('RESUME_ANALYSIS', resumePayload());
  assert.equal(execution.attempts, 2);
  assert.equal(execution.correctionsUsed, 1);
  assert.equal(calls.length, 2);
});

test('D6. proven auditability under collapse: SUCCESS row + typed FAILED rows unchanged', async () => {
  const userId = new mongoose.Types.ObjectId().toString();
  queue.push(
    { kind: 'error', category: 'RATE_LIMITED', upstreamStatus: 429 },
    { kind: 'error', category: 'RATE_LIMITED', upstreamStatus: 429 },
    { kind: 'success', text: JSON.stringify(VALID_RESUME) }
  );
  const payload = { ...resumePayload(), userId };
  const { execution } = await orchestrator.run('RESUME_ANALYSIS', payload);
  assert.equal(execution.attempts, 3);
  const rows = await AIExecution.find({ userId }).sort({ attempt: 1 }).lean();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].errorCode, 'RATE_LIMITED');
  assert.equal(rows[2].status, 'SUCCESS');
});