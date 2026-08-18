// Option-B gap-resolution tests — answer-evaluation prompt clarification
// (docs/07 §4, answer-evaluation-v2) and the unchanged Zod subset gate.
//
// These are PROMPT-CONSTRUCTION and SCHEMA-VALIDATION tests only: no DB, no
// provider mocks, no orchestrator routing. Live-provider behavior is NOT
// claimed here (docs/15 experiment + any future probe own that claim).
const { test } = require('node:test');
const assert = require('node:assert');
const { buildUserContent, buildPrompt, SYSTEM_INSTRUCTION } = require('../src/ai/answerEvaluator');
const { createAnswerEvaluationSchema } = require('../src/ai/schemas/answerEvaluation.schema');

const QUESTION = {
  id: 'q1',
  text: 'Explain how a MongoDB index works.',
  category: 'database',
  difficulty: 'medium',
  expectedTopics: [{ skillKey: 'mongodb', topic: 'indexes' }],
};
const PROFILE = { targetRole: 'Backend Engineer', experienceLevel: 'mid' };

const MAPPING_SENTENCE =
  'Each topicAssessments[].skillKey must be copied EXACTLY from one of the expected-topic skillKeys above (the key before the colon) — never include the topic text, the colon, or any other explanation.';

test('OB-1. prompt construction: the explicit skillKey mapping sentence is present', () => {
  const content = buildUserContent({ question: QUESTION, candidateAnswer: 'x', candidateProfile: PROFILE });
  assert.ok(content.includes(MAPPING_SENTENCE), 'the mapping rule is stated in the user content template');
});

test('OB-2. prompt construction: the rendered pair format is retained (additive amendment)', () => {
  const content = buildUserContent({ question: QUESTION, candidateAnswer: 'x', candidateProfile: PROFILE });
  assert.ok(content.includes('Expected topics: mongodb: indexes'), 'key: topic pair rendering preserved');
  assert.ok(content.indexOf('Expected topics:') < content.indexOf(MAPPING_SENTENCE), 'rule follows the pairs it refers to');
});

test('OB-3. prompt construction: buildPrompt still composes system instruction + user content', () => {
  const prompt = buildPrompt({ question: QUESTION, candidateAnswer: 'x', candidateProfile: PROFILE });
  assert.ok(prompt.startsWith(SYSTEM_INSTRUCTION));
  assert.ok(prompt.includes('\n\n'));
  assert.ok(prompt.includes('<answer>') && prompt.includes('</answer>'));
  assert.ok(prompt.includes('x'), 'candidate answer inside <answer> tags');
});

test('OB-4. prompt construction: the rule names every requirement (key, topic, colon, source)', () => {
  const content = buildUserContent({ question: QUESTION, candidateAnswer: 'x', candidateProfile: PROFILE });
  assert.ok(content.includes('skillKeys above'), 'the source of valid values is the provided expected-topic skillKeys');
  assert.ok(content.includes('key before the colon'), 'the key-side of the pair is identified');
  assert.ok(content.includes('never include the topic text, the colon'), 'topic and colon are excluded from skillKey');
  assert.ok(content.includes('EXACTLY'), 'exact copying is demanded');
});

test('OB-5. schema validation: the drift values remain REJECTED (docs/07 §3 subset rule, unchanged)', () => {
  const schema = createAnswerEvaluationSchema(QUESTION.expectedTopics);
  const base = {
    correctness: 80,
    technicalDepth: 70,
    communication: 60,
    strengths: ['clear structure'],
    weaknesses: ['missing depth'],
    improvementTip: 'Add a concrete example of a covering index.',
  };
  const reject = (skillKey) => {
    const res = schema.safeParse({ ...base, topicAssessments: [{ skillKey, addressed: true, quality: 'good' }] });
    assert.equal(res.success, false, `must reject skillKey: ${JSON.stringify(skillKey)}`);
  };
  reject('mongodb: indexes');
  reject('mongodb: schema design');
  reject('indexes');
  reject('MongoDB');
  reject('MONGODB');
  reject('nosql');
});

test('OB-6. schema validation: the exact canonical key still passes (case-sensitive membership)', () => {
  const schema = createAnswerEvaluationSchema(QUESTION.expectedTopics);
  const base = {
    correctness: 80,
    technicalDepth: 70,
    communication: 60,
    strengths: ['clear structure'],
    weaknesses: ['missing depth'],
    improvementTip: 'Add a concrete example of a covering index.',
  };
  const ok = schema.safeParse({ ...base, topicAssessments: [{ skillKey: 'mongodb', addressed: true, quality: 'good' }] });
  assert.equal(ok.success, true, 'the canonical key from expectedTopics passes unchanged');
});

test('OB-7. multi-topic: both canonical keys pass, any drift fails (subset enforced per skill)', () => {
  const question = {
    ...QUESTION,
    expectedTopics: [
      { skillKey: 'mongodb', topic: 'indexes' },
      { skillKey: 'rest-apis', topic: 'rate limiting' },
    ],
  };
  const schema = createAnswerEvaluationSchema(question.expectedTopics);
  const base = {
    correctness: 80,
    technicalDepth: 70,
    communication: 60,
    strengths: [],
    weaknesses: [],
    improvementTip: 'Tip.',
  };
  const good = schema.safeParse({
    ...base,
    topicAssessments: [
      { skillKey: 'mongodb', addressed: true, quality: 'good' },
      { skillKey: 'rest-apis', addressed: true, quality: 'weak' },
    ],
  });
  assert.equal(good.success, true, 'both canonical keys accepted');
  const bad = schema.safeParse({
    ...base,
    topicAssessments: [
      { skillKey: 'mongodb', addressed: true, quality: 'good' },
      { skillKey: 'rest-apis: rate limiting', addressed: true, quality: 'weak' },
    ],
  });
  assert.equal(bad.success, false, 'KEY: VALUE drift rejected even among multiple pairs');
});