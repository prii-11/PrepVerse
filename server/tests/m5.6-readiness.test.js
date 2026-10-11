// M5.6 Readiness Service tests (docs/07 §6, docs/08 §6). This suite proves the
// EXISTING analytics.service.js readiness computation (implemented since M4.4,
// commit 7bffc8f, untouched since) against the authoritative contract — it
// does NOT re-implement readiness and does NOT mock analytics.service.js.
//
// Real Mongo persistence is used for every persisted input (users,
// RoleSkillCatalog, interviews with reports); expected values are hand-derived
// from the docs/07 §6 formulas (independent arithmetic on the fixture numbers,
// never by calling the production helpers under test — no tautological
// assertions).
//
// Same environment preamble and single-node MongoMemoryReplSet as
// m5.1-ai-infra.test.js (readiness is read-only and needs no transaction, but
// the shared fixture infrastructure keeps behavior consistent).
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('node:child_process');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const REPO_ROOT = execSync('git rev-parse --show-toplevel', { cwd: __dirname, encoding: 'utf8' }).trim();
// M7 scope for the git-state guards: the approved frontend-integration
// milestone legitimately changes files under client/ and ships the two
// reconciled docs/18 artifacts. Anything else in the tree (server/, root,
// other docs) is contamination and must fail the guard.
const M7_APPROVED_TREE_PREFIXES = ['client/'];
// M6.1 (Azure DI fallback, docs/21) is the approved server-side scope riding
// inside this milestone's tree — the whitelist grows as approved work lands.
const M7_APPROVED_TREE_FILES = [
  'docs/18-m7-frontend-recon.md',
  'docs/18-azure-di-fallback-report.md',
  'docs/19-m7-p3-resume-recon.md',
  'docs/20-m7-p4-interview-recon.md',
  'docs/21-azure-di-extraction-audit.md',
  'server/tests/m5.1-ai-infra.test.js',
  'server/tests/m5.6-readiness.test.js',
  'server/tests/m6-azure-extraction.test.js',
  'server/tests/m6-resume-upload.test.js',
  'server/src/config/di.js',
  'server/src/config/env.js',
  'server/src/modules/interviews/interview.validation.js',
  'server/src/modules/interviews/interview.service.js',
  'server/src/modules/resumes/resume.service.js',
  'server/src/storage/azure.di.extractor.js',
  'server/src/storage/textExtractor.js',
  'server/.env.example',
  'docs/02-architecture-api.md',
  'server/src/ai/questionGenerator.js',
  'server/src/ai/providers/gemini.js',
  'server/src/ai/orchestrator.js',
];

function isM7ApprovedStatusLine(line) {
  const path = line.slice(3).trim(); // strip the "?? "/" M "/"M  " status prefix
  return M7_APPROVED_TREE_PREFIXES.some((prefix) => path.startsWith(prefix)) || M7_APPROVED_TREE_FILES.includes(path);
}

function assertApprovedM7WorkingTree() {
  const status = execSync('git status --short', { encoding: 'utf8', cwd: REPO_ROOT });
  const violations = status
    .split('\n')
    .filter(Boolean)
    .filter((line) => !isM7ApprovedStatusLine(line));
  assert.deepEqual(violations, [], `working tree must contain only approved M7 changes: ${status}`);
}
const User = require('../src/modules/users/user.model');
const Interview = require('../src/modules/interviews/interview.model');
const RoleSkillCatalog = require('../src/modules/analytics/roleSkillCatalog.model');
const analyticsService = require('../src/modules/analytics/analytics.service');
const { SCORING_CONFIG } = require('../src/config/scoring');
const { signAccessToken } = require('../src/utils/jwt');

// Hand-derived expectations only. The production helpers under test
// (sampleStddev / linearRegressionSlope inside analytics.service.js) are never
// called from this file.
const nearly = (actual, expected, epsilon = 1e-9) =>
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${expected} (diff < ${epsilon}), got ${actual}`
  );

// ---------------------------------------------------------------------------
// DB lifecycle (single-node replica set, same as m5.1-ai-infra.test.js)
// ---------------------------------------------------------------------------

let mongoServer;
let httpServer;

test.before(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  await seedCatalog();
});

test.after(async () => {
  if (httpServer) await new Promise((resolve) => httpServer.close(resolve));
  await mongoose.disconnect();
  await mongoServer.stop();
});

// ---------------------------------------------------------------------------
// Fixtures — real repository structures, exact schema field names
// ---------------------------------------------------------------------------

// Mirror of scripts/seedRoleSkillCatalog.js "Backend Developer" entry.
const CATALOG_ROLE = 'Backend Developer';
const CATALOG_TOTAL_WEIGHT = 1.0 + 1.0 + 0.9 + 0.9 + 0.7; // 4.5

async function seedCatalog() {
  await RoleSkillCatalog.create({
    role: CATALOG_ROLE,
    requiredSkills: [
      { skillKey: 'javascript', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'nodejs', weight: 1.0, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'sql', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'rest-apis', weight: 0.9, minimumLevel: 'INTERMEDIATE' },
      { skillKey: 'nosql', weight: 0.7, minimumLevel: 'BEGINNER' },
    ],
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  });
}

async function seedUser({ targetRole = CATALOG_ROLE, skills = [] } = {}) {
  return User.create({
    email: `${new mongoose.Types.ObjectId().toString()}@prepverse.test`,
    passwordHash: 'x'.repeat(60),
    firstName: 'Test',
    lastName: 'User',
    profileCompleted: true,
    profile: { targetRole, experienceLevel: 'Entry' },
    currentSkillProfile: { skills, updatedAt: new Date('2026-01-01T00:00:00.000Z') },
  });
}

function profileSkill(skillKey, { assessed = true, level = null, sources = ['INTERVIEW'] } = {}) {
  return { skillKey, sources, assessed, level };
}

// A COMPLETED interview carrying a real report. completedAt is explicit so the
// deterministic recency ordering is fully under the test's control.
async function seedCompletedInterview(
  userId,
  { overallScore, technicalScore, communicationScore, completedAt, profileSyncStatus = 'COMPLETED' }
) {
  return Interview.create({
    userId,
    targetRole: CATALOG_ROLE,
    difficulty: 'medium',
    status: 'COMPLETED',
    questionGeneration: { status: 'COMPLETED' },
    report: {
      overallScore,
      technicalScore,
      communicationScore,
      strengths: [],
      weaknesses: [],
      recommendations: [],
      generatedAt: completedAt,
      profileSyncStatus,
    },
    completedAt,
  });
}

// ---------------------------------------------------------------------------
// M5.6 tests — actual readiness behavior against hand-derived expectations
// ---------------------------------------------------------------------------

test('M5.6-1. zero COMPLETED interviews → score null; report-derived components null; coverage reports its true value', async () => {
  const user = await seedUser();
  const result = await analyticsService.getReadiness(user._id.toString());
  assert.strictEqual(result.score, null);
  assert.strictEqual(result.interviewCount, 0);
  // "0 interviews completed → readiness: null" (docs/07 §6:277-278) governs
  // the SCORE. The report-derived components have no input and are null; the
  // profile-derived skillCoverage is not a report average and reports the true
  // value for a matched targetRole (0 covered skills → 0) — the "never
  // fabricate" rule (docs/07 §6:305) applies to unmatched targetRole, covered
  // by M5.6-14.
  assert.strictEqual(result.breakdown.technical, null);
  assert.strictEqual(result.breakdown.communication, null);
  assert.strictEqual(result.breakdown.consistency, null);
  assert.strictEqual(result.breakdown.improvementTrend, null);
  assert.strictEqual(result.breakdown.skillCoverage, 0);
  // The candidate is never omitted and no error is raised.
});

test('M5.6-2. one COMPLETED interview → technical/communication/skillCoverage active, renormalized over 0.80', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  const result = await analyticsService.getReadiness(user._id.toString());

  // Covered: javascript (1.0, INTERMEDIATE ≥ INTERMEDIATE) + nodejs (1.0) +
  // nosql (0.7, BEGINNER ≥ BEGINNER) = 2.7 of 4.5 → 60.0.
  nearly(result.breakdown.skillCoverage, 60);
  nearly(result.breakdown.technical, 60);
  nearly(result.breakdown.communication, 60);
  // 1 interview: consistency + trend are neutral priors, REPORTED as 50.
  assert.strictEqual(result.breakdown.consistency, 50);
  assert.strictEqual(result.breakdown.improvementTrend, 50);
  // Active = {technical, communication, skillCoverage}, ÷ 0.80:
  // (0.35×60 + 0.20×60 + 0.25×60) / 0.80 = 48 / 0.8 = 60.
  nearly(result.score, 60);
  assert.strictEqual(result.interviewCount, 1);
});

test('M5.6-3. two COMPLETED interviews → improvementTrend active, consistency excluded, ÷ 0.90', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  // Trend scores 60 → 70: a 2-point line has slope y[1] − y[0] = 10.
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  await seedCompletedInterview(user._id, {
    overallScore: 70,
    technicalScore: 70,
    communicationScore: 70,
    completedAt: new Date('2026-01-03T00:00:00.000Z'),
  });

  const result = await analyticsService.getReadiness(user._id.toString());

  nearly(result.breakdown.technical, 65); // (60+70)/2
  nearly(result.breakdown.communication, 65);
  nearly(result.breakdown.skillCoverage, 60);
  // Consistency still uses the neutral prior at 2 interviews.
  assert.strictEqual(result.breakdown.consistency, 50);
  // Trend measured: slope 10 → 50 + (10/20)×50 = 75.
  nearly(result.breakdown.improvementTrend, 75);
  // Active = {technical, communication, skillCoverage, improvementTrend},
  // ÷ 0.90: (0.35×65 + 0.20×65 + 0.25×60 + 0.10×75) / 0.90
  //        = (22.75 + 13 + 15 + 7.5) / 0.90 ≈ 64.7222…
  nearly(result.score, 58.25 / 0.9);
  assert.strictEqual(result.interviewCount, 2);
});

test('M5.6-4. three COMPLETED interviews → all five components active, weights sum to 1 (÷ 1.0)', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  // overallScores [50, 60, 70]: mean 60, sample stddev sqrt((100+0+100)/2) = 10,
  // slope = (c − a) / 2 = 10 → trend 75. All five components active.
  const rows = [
    { overall: 50, tech: 55, comm: 52, at: '2026-01-02T00:00:00.000Z' },
    { overall: 60, tech: 62, comm: 60, at: '2026-01-03T00:00:00.000Z' },
    { overall: 70, tech: 70, comm: 66, at: '2026-01-04T00:00:00.000Z' },
  ];
  for (const r of rows) {
    await seedCompletedInterview(user._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }

  const result = await analyticsService.getReadiness(user._id.toString());

  nearly(result.breakdown.technical, (55 + 62 + 70) / 3); // 62.333…
  nearly(result.breakdown.communication, (52 + 60 + 66) / 3); // 59.333…
  nearly(result.breakdown.skillCoverage, 60);
  nearly(result.breakdown.consistency, 100 - (10 / 50) * 100); // 80
  nearly(result.breakdown.improvementTrend, 75);
  // Weights sum to exactly 1.0 → no renormalization at 3+ interviews.
  const expectedScore = 0.35 * ((55 + 62 + 70) / 3) + 0.2 * ((52 + 60 + 66) / 3) + 0.25 * 60 + 0.1 * 80 + 0.1 * 75;
  nearly(result.score, expectedScore);
  assert.strictEqual(result.interviewCount, 3);
});

test('M5.6-5. five-plus COMPLETED interviews → consistency/trend use only the latest five; technical/communication are lifetime', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  // 7 interviews. technical/communication must average ALL 7; consistency and
  // trend operate on the last 5 overallScores [50, 55, 60, 75, 80].
  const rows = [
    { overall: 40, tech: 40, comm: 41, at: '2026-01-02T00:00:00.000Z' },
    { overall: 45, tech: 45, comm: 46, at: '2026-01-03T00:00:00.000Z' },
    { overall: 50, tech: 50, comm: 51, at: '2026-01-04T00:00:00.000Z' },
    { overall: 55, tech: 55, comm: 56, at: '2026-01-05T00:00:00.000Z' },
    { overall: 60, tech: 60, comm: 61, at: '2026-01-06T00:00:00.000Z' },
    { overall: 75, tech: 75, comm: 76, at: '2026-01-07T00:00:00.000Z' },
    { overall: 80, tech: 80, comm: 81, at: '2026-01-08T00:00:00.000Z' },
  ];
  for (const r of rows) {
    await seedCompletedInterview(user._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }

  const result = await analyticsService.getReadiness(user._id.toString());

  // Lifetime: 405/7 ≈ 57.8571 and 412/7 ≈ 58.8571 (ALL 7 interviews).
  nearly(result.breakdown.technical, 405 / 7);
  nearly(result.breakdown.communication, 412 / 7);

  // Recent window only — hand-derived from the last five overallScores:
  //   consistency: mean 64; dev² sum (14²+9²+4²+11²+16²) = 670; sample
  //   variance 670/4 = 167.5; σ = sqrt(167.5) ≈ 12.94218;
  //   consistency = 100 − (σ/50)×100 ≈ 74.11564.
  //   trend: Σx=10, Σy=320, Σxy=0·50+1·55+2·60+3·75+4·80=720, Σxx=30;
  //   slope = (5·720 − 10·320)/(5·30 − 100) = 400/50 = 8;
  //   improvementTrend = 50 + (8/20)×50 = 70.
  const recentDerivedConsistency = 100 - (Math.sqrt(670 / 4) / 50) * 100;
  nearly(result.breakdown.consistency, recentDerivedConsistency);
  nearly(result.breakdown.improvementTrend, 70);
  assert.strictEqual(result.interviewCount, 7);

  // Sanity: the lifetime mean must differ from the recent-window mean (40, 45
  // must not leak into the window).
  const recentMean = (50 + 55 + 60 + 75 + 80) / 5;
  assert.ok(Math.abs(405 / 7 - recentMean) > 5, 'lifetime and recent windows differ');
});

test('M5.6-6. neutral priors are reported as 50 and excluded from the weighted sum — never counted as zero', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  const result = await analyticsService.getReadiness(user._id.toString());

  // Breakdown reports the priors at their documented value (docs/07 §6:303)…
  assert.strictEqual(result.breakdown.consistency, 50);
  assert.strictEqual(result.breakdown.improvementTrend, 50);
  // …but they are EXCLUDED from the score: score stays 60. If the priors were
  // included as 0 the score would be (48 + 0 + 0)/1.0 = 48; if included at 50
  // with their normal weights it would be (48 + 5 + 5)/1.0 = 58. Only
  // exclusion + renormalization over 0.80 gives 60.
  nearly(result.score, 60);
});

test('M5.6-7. consistency math: independent stddev recomputation (3 interviews)', async () => {
  const user = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  // overallScores [40, 70, 100]: mean 70; dev² = 900 + 0 + 900; sample variance
  // 1800/2 = 900 → σ = 30 → consistency = 100 − (30/50)×100 = 40. Hand-derived.
  const rows = [
    { overall: 40, tech: 40, comm: 40, at: '2026-01-02T00:00:00.000Z' },
    { overall: 70, tech: 70, comm: 70, at: '2026-01-03T00:00:00.000Z' },
    { overall: 100, tech: 100, comm: 100, at: '2026-01-04T00:00:00.000Z' },
  ];
  for (const r of rows) {
    await seedCompletedInterview(user._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }

  const result = await analyticsService.getReadiness(user._id.toString());
  nearly(result.breakdown.consistency, 100 - (30 / 50) * 100); // 40 exactly
});

test('M5.6-8. consistency saturation: stddev = 50 → 0; stddev > 50 → clamped to 0; mid-range → not clamped', async () => {
  // Case A: σ exactly 50. [0, 50, 100]: mean 50, dev² = 2500+0+2500, sample
  // variance 5000/2 = 2500 → σ = 50 → normalized volatility 100 → consistency 0.
  const at50 = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  for (const r of [
    { overall: 0, tech: 0, comm: 0, at: '2026-01-02T00:00:00.000Z' },
    { overall: 50, tech: 50, comm: 50, at: '2026-01-03T00:00:00.000Z' },
    { overall: 100, tech: 100, comm: 100, at: '2026-01-04T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(at50._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  let result = await analyticsService.getReadiness(at50._id.toString());
  assert.strictEqual(result.breakdown.consistency, 0, 'σ = 50 saturates volatility → consistency 0');
  assert.strictEqual(Math.sqrt(5000 / 2), 50, 'fixture sanity: σ is exactly 50');

  // Case B: σ ≈ 57.7 > 50. [0, 0, 100]: mean 100/3; dev² = (100/3)² ×2 +
  // (200/3)² = 60000/9; sample variance 60000/18 ≈ 3333.33 → σ ≈ 57.735, i.e.
  // normalized volatility ≈ 115.5 → clamped to 100 → consistency 0.
  const above = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  for (const r of [
    { overall: 0, tech: 0, comm: 0, at: '2026-01-02T00:00:00.000Z' },
    { overall: 0, tech: 0, comm: 0, at: '2026-01-03T00:00:00.000Z' },
    { overall: 100, tech: 100, comm: 100, at: '2026-01-04T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(above._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  result = await analyticsService.getReadiness(above._id.toString());
  assert.strictEqual(result.breakdown.consistency, 0, 'σ > 50 clamps volatility → consistency 0');
  assert.ok(Math.sqrt(60000 / 18) > 50, 'fixture sanity: σ ≈ 57.7 > MAX_EXPECTED_STDDEV');

  // Control: mid-range volatility is not clamped. [55, 60, 65]: dev² = 25+0+25,
  // variance 25 → σ = 5 → consistency = 100 − 10 = 90.
  const control = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  for (const r of [
    { overall: 55, tech: 55, comm: 55, at: '2026-01-02T00:00:00.000Z' },
    { overall: 60, tech: 60, comm: 60, at: '2026-01-03T00:00:00.000Z' },
    { overall: 65, tech: 65, comm: 65, at: '2026-01-04T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(control._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  result = await analyticsService.getReadiness(control._id.toString());
  nearly(result.breakdown.consistency, 90);
});

test('M5.6-9. trend math: positive and negative slopes against hand-computed expectations', async () => {
  // Positive case: overallScores [60, 80] → 2-point slope 20 →
  // improvementTrend = 50 + (20/20)×50 = 100.
  const up = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  for (const r of [
    { overall: 60, tech: 60, comm: 60, at: '2026-01-02T00:00:00.000Z' },
    { overall: 80, tech: 80, comm: 80, at: '2026-01-03T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(up._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  let result = await analyticsService.getReadiness(up._id.toString());
  nearly(result.breakdown.improvementTrend, 100);

  // Negative case: [70, 60, 50] → slope = (c − a)/2 = −10 (3-point series) →
  // improvementTrend = 50 − (10/20)×50 = 25.
  const down = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  for (const r of [
    { overall: 70, tech: 70, comm: 70, at: '2026-01-02T00:00:00.000Z' },
    { overall: 60, tech: 60, comm: 60, at: '2026-01-03T00:00:00.000Z' },
    { overall: 50, tech: 50, comm: 50, at: '2026-01-04T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(down._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  result = await analyticsService.getReadiness(down._id.toString());
  nearly(result.breakdown.improvementTrend, 25);
});

test('M5.6-10. trend saturation: ±20 → 0/100; beyond ±20 clamped', async () => {
  // slope exactly −20 → 0: [80, 60] → slope −20 → 50 − 50 = 0.
  const a = await seedUser({ skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })] });
  for (const r of [
    { overall: 80, tech: 80, comm: 80, at: '2026-01-02T00:00:00.000Z' },
    { overall: 60, tech: 60, comm: 60, at: '2026-01-03T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(a._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  let result = await analyticsService.getReadiness(a._id.toString());
  assert.strictEqual(result.breakdown.improvementTrend, 0, 'slope −20 → 0');

  // slope −30 (< −20) → raw −25 → clamped to 0: [100, 70, 40] → (40−100)/2 = −30.
  const b = await seedUser({ skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })] });
  for (const r of [
    { overall: 100, tech: 100, comm: 100, at: '2026-01-02T00:00:00.000Z' },
    { overall: 70, tech: 70, comm: 70, at: '2026-01-03T00:00:00.000Z' },
    { overall: 40, tech: 40, comm: 40, at: '2026-01-04T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(b._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  result = await analyticsService.getReadiness(b._id.toString());
  assert.strictEqual(result.breakdown.improvementTrend, 0, 'slope < −20 clamped to 0');

  // slope exactly +20 → 100: [40, 60] → slope 20 → 50 + 50 = 100.
  const c = await seedUser({ skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })] });
  for (const r of [
    { overall: 40, tech: 40, comm: 40, at: '2026-01-02T00:00:00.000Z' },
    { overall: 60, tech: 60, comm: 60, at: '2026-01-03T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(c._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  result = await analyticsService.getReadiness(c._id.toString());
  assert.strictEqual(result.breakdown.improvementTrend, 100, 'slope +20 → 100');

  // slope +30 (> +20) → raw 125 → clamped to 100: [40, 70, 100] → (100−40)/2 = 30.
  const d = await seedUser({ skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })] });
  for (const r of [
    { overall: 40, tech: 40, comm: 40, at: '2026-01-02T00:00:00.000Z' },
    { overall: 70, tech: 70, comm: 70, at: '2026-01-03T00:00:00.000Z' },
    { overall: 100, tech: 100, comm: 100, at: '2026-01-04T00:00:00.000Z' },
  ]) {
    await seedCompletedInterview(d._id, {
      overallScore: r.overall,
      technicalScore: r.tech,
      communicationScore: r.comm,
      completedAt: new Date(r.at),
    });
  }
  result = await analyticsService.getReadiness(d._id.toString());
  assert.strictEqual(result.breakdown.improvementTrend, 100, 'slope > +20 clamped to 100');
});

test('M5.6-11. skill coverage: assessed + level at-or-above minimumLevel → covered', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }), // covered: 1.0
      profileSkill('nosql', { level: 'BEGINNER' }), // covered: 0.7 (BEGINNER ≥ BEGINNER)
      profileSkill('sql', { level: 'BEGINNER' }), // NOT covered: INTERMEDIATE required
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const result = await analyticsService.getReadiness(user._id.toString());

  // Covered = 1.0 + 0.7 = 1.7 of 4.5 → 37.777…
  nearly(result.breakdown.skillCoverage, (1.7 / CATALOG_TOTAL_WEIGHT) * 100);
});

test('M5.6-12. skill coverage with unequal catalog weights: hand-computed weighted result', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }), // 1.0 covered
      profileSkill('nodejs', { level: 'INTERMEDIATE' }), // 1.0 covered
      profileSkill('nosql', { level: 'BEGINNER' }), // 0.7 covered
      profileSkill('sql', { level: 'INTERMEDIATE' }), // 0.9 covered
      // rest-apis (0.9) absent → not covered.
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const result = await analyticsService.getReadiness(user._id.toString());

  // Covered weight = 1.0 + 1.0 + 0.7 + 0.9 = 3.6 of 4.5 → exactly 80.0.
  nearly(result.breakdown.skillCoverage, 80);
});

test('M5.6-13. resume-only / unassessed skills never count as covered interview evidence', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE', sources: ['RESUME', 'INTERVIEW'] }),
      // The only evidence for nodejs/sql is a resume claim: assessed stays false.
      profileSkill('nodejs', { assessed: false, level: null, sources: ['RESUME'] }),
      profileSkill('sql', { assessed: false, level: null, sources: ['RESUME'] }),
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const result = await analyticsService.getReadiness(user._id.toString());

  // Only javascript is covered: 1.0 of 4.5 → 22.222… (no resume boost).
  nearly(result.breakdown.skillCoverage, (1.0 / CATALOG_TOTAL_WEIGHT) * 100);
});

test('M5.6-14. unmatched targetRole → skillCoverage null → overall score null (never 0/50/fallback)', async () => {
  const user = await seedUser({
    targetRole: 'Frontend Developer', // not in the catalog
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const result = await analyticsService.getReadiness(user._id.toString());

  assert.strictEqual(result.breakdown.skillCoverage, null);
  assert.strictEqual(result.score, null, 'no substitute value for an unmatched role');
  // Measured components are still reported — only the overall score is null.
  nearly(result.breakdown.technical, 60);
  assert.strictEqual(result.interviewCount, 1);

  // No targetRole at all behaves identically.
  const noRole = await seedUser({ targetRole: null });
  await seedCompletedInterview(noRole._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const noRoleResult = await analyticsService.getReadiness(noRole._id.toString());
  assert.strictEqual(noRoleResult.breakdown.skillCoverage, null);
  assert.strictEqual(noRoleResult.score, null);
});

test('M5.6-15. COMPLETED interview with profileSyncStatus FAILED (and PENDING) still counts toward readiness', async () => {
  const user = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
    profileSyncStatus: 'FAILED',
  });
  await seedCompletedInterview(user._id, {
    overallScore: 80,
    technicalScore: 80,
    communicationScore: 80,
    completedAt: new Date('2026-01-03T00:00:00.000Z'),
    profileSyncStatus: 'PENDING',
  });
  const result = await analyticsService.getReadiness(user._id.toString());

  assert.strictEqual(result.interviewCount, 2, 'profileSyncStatus never excludes a COMPLETED interview');
  nearly(result.breakdown.technical, 70); // (60+80)/2 — both reports counted
  nearly(result.breakdown.communication, 70);
  assert.strictEqual(result.breakdown.consistency, 50); // 2 interviews: neutral prior
  nearly(result.breakdown.improvementTrend, 100); // slope 20 → 100
  assert.ok(result.score !== null, 'readiness is still computable');
});

test('M5.6-16. CANCELLED and EVALUATION_FAILED interviews are excluded from readiness', async () => {
  const user = await seedUser({
    skills: [profileSkill('javascript', { level: 'INTERMEDIATE' })],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 90,
    technicalScore: 90,
    communicationScore: 90,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  // A CANCELLED interview that nonetheless carries a report (M5.4 leaves
  // completed answers in place on EVALUATION_FAILED; neither may leak in).
  for (const [status, score] of [
    ['CANCELLED', 10],
    ['EVALUATION_FAILED', 10],
  ]) {
    await Interview.create({
      userId: user._id,
      targetRole: CATALOG_ROLE,
      difficulty: 'medium',
      status,
      questionGeneration: { status: 'COMPLETED' },
      report: { overallScore: score, technicalScore: score, communicationScore: score },
      completedAt: new Date('2026-01-03T00:00:00.000Z'),
    });
  }
  for (const status of ['CANCELLED', 'EVALUATION_FAILED']) {
    const stored = await Interview.findOne({ userId: user._id, status });
    assert.strictEqual(stored.report.overallScore, 10, `fixture sanity: ${status} carries a report`);
  }

  const result = await analyticsService.getReadiness(user._id.toString());
  assert.strictEqual(result.interviewCount, 1, 'only the COMPLETED interview counts');
  nearly(result.breakdown.technical, 90);
});

test('M5.6-17. determinism: two calls over unchanged persisted state are byte-identical', async () => {
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 62,
    communicationScore: 58,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });
  const first = await analyticsService.getReadiness(user._id.toString());
  const second = await analyticsService.getReadiness(user._id.toString());

  assert.strictEqual(JSON.stringify(first), JSON.stringify(second), 'byte-identical readiness for identical state');
  assert.ok(typeof first.score === 'number' && Number.isFinite(first.score), 'a real score was produced');
});

test('M5.6-18. HTTP response contract: 401 without token, 200 {score, breakdown, interviewCount} with token', async () => {
  const app = require('../src/app');
  const user = await seedUser({
    skills: [
      profileSkill('javascript', { level: 'INTERMEDIATE' }),
      profileSkill('nodejs', { level: 'INTERMEDIATE' }),
      profileSkill('nosql', { level: 'BEGINNER' }),
    ],
  });
  await seedCompletedInterview(user._id, {
    overallScore: 60,
    technicalScore: 60,
    communicationScore: 60,
    completedAt: new Date('2026-01-02T00:00:00.000Z'),
  });

  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  const url = `http://127.0.0.1:${httpServer.address().port}/api/v1/analytics/readiness`;

  // Authentication is required: no token → 401.
  const noAuth = await fetch(url);
  assert.strictEqual(noAuth.status, 401, 'unauthenticated request is rejected');

  const token = signAccessToken(user);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  assert.strictEqual(res.status, 200);
  const body = await res.json();

  // Response shape: score, breakdown (exactly the five components),
  // interviewCount (delivered in code since M4.4; reconciled into docs/02 §3).
  assert.deepEqual(Object.keys(body).sort(), ['breakdown', 'interviewCount', 'score']);
  assert.deepEqual(Object.keys(body.breakdown).sort(), [
    'communication',
    'consistency',
    'improvementTrend',
    'skillCoverage',
    'technical',
  ]);
  assert.strictEqual(body.interviewCount, 1);
  nearly(body.breakdown.skillCoverage, 60);
  nearly(body.breakdown.technical, 60);
  nearly(body.breakdown.communication, 60);
  nearly(body.score, 60);
});

test('M5.6-19. git state: clean tree, M5.6 implementation commit in history', async () => {
  assertApprovedM7WorkingTree();
  const commit = execSync('git log --format=%H -1 --grep="M5.6"', { encoding: 'utf8', cwd: REPO_ROOT }).trim();
  assert.notEqual(commit, '', 'an M5.6 commit must exist');
  const ancestor = execSync(`git merge-base --is-ancestor ${commit} HEAD && echo yes || echo no`, {
    encoding: 'utf8',
    cwd: REPO_ROOT,
  }).trim();
  assert.equal(ancestor, 'yes', 'the M5.6 commit must be an ancestor of HEAD');
});