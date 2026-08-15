// AnalyticsService — deterministic read-only analytics (M4.4).
//
// Endpoints (docs/02 §3): readiness (computed on read via the finalized
// docs/07 §6 formula), progress (score trend across completed interviews,
// ordered by completedAt), practice-plan (computed on-demand from the current
// skill profile + RoleSkillCatalog gap algorithm, docs/08 §7).
//
// Owned models: User, Interview, RoleSkillCatalog — analytics aggregates
// across all three. Every query is scoped to the authenticated userId; results
// are computed on read and NEVER persisted (no readinessScore/Readiness/
// PracticePlan model anywhere — docs/05 §2 note). No AI, no storage.
//
// Determinism: given identical DB state the output is identical — the only
// time-based input is the persisted completedAt (ordering/window selection),
// never the current clock. No rounding is applied; values are raw doubles.
const User = require('../users/user.model');
const Interview = require('../interviews/interview.model');
const RoleSkillCatalog = require('./roleSkillCatalog.model');
const { SCORING_CONFIG } = require('../../config/scoring');
const { NotFoundError } = require('../../utils/errors');

// Canonical level ordering (docs/07 §6): BEGINNER < INTERMEDIATE < ADVANCED.
const LEVEL_RANK = { BEGINNER: 1, INTERMEDIATE: 2, ADVANCED: 3 };

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// Sample standard deviation (n-1). Chosen over population stddev because the
// doc's boundary rule requires a reachable "stddev > MAX_EXPECTED_STDDEV"
// state; with scores bounded [0,100] population stddev can never exceed 50,
// while sample stddev can (e.g. [0,0,100] → ≈57.7). Only called for >= 3
// values (n-1 >= 2), so it is never a divide-by-zero.
function sampleStddev(values) {
  const n = values.length;
  if (n < 2) return null;
  const mean = values.reduce((sum, v) => sum + v, 0) / n;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance);
}

// Least-squares slope of the series against its index (0, 1, 2, ...). This is
// the docs/07 §6 "linear regression slope of overallScore vs interview index".
function linearRegressionSlope(y) {
  const n = y.length;
  if (n < 2) return null;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  for (let i = 0; i < n; i += 1) {
    sumX += i;
    sumY += y[i];
    sumXY += i * y[i];
    sumXX += i * i;
  }
  const denominator = n * sumXX - sumX * sumX;
  if (denominator === 0) return null;
  return (n * sumXY - sumX * sumY) / denominator;
}

// The user's completed interviews that carry a real report (docs/02 §3
// discriminator used by M4.3 getReport: report.overallScore present).
// Chronological by completedAt (resolved in docs/02 §3 for /progress); the
// createdAt/_id tie-breaks keep ordering deterministic. Only the report
// sub-fields and timestamps needed for scoring are loaded.
async function completedInterviewScores(userId) {
  const interviews = await Interview.find({ userId, status: 'COMPLETED' })
    .select('report completedAt createdAt')
    .sort({ completedAt: 1, createdAt: 1, _id: 1 })
    .lean();

  return interviews
    .filter((i) => i.report && typeof i.report.overallScore === 'number')
    .map((i) => ({
      _id: i._id,
      completedAt: i.completedAt,
      createdAt: i.createdAt,
      overallScore: i.report.overallScore,
      technicalScore: i.report.technicalScore,
      communicationScore: i.report.communicationScore,
    }));
}

// Weighted skill coverage (docs/08 §6, §8). A required skill is covered only
// when the user's skill is assessed and rank(level) >= rank(minimumLevel);
// resume-only claims contribute 0. Returns 0-100, or null when no targetRole
// / no matching catalog exists — never a fabricated value (docs/05 §5 keeps
// targetRole ∈ catalog once onboarding completes; this only fires pre-profile).
async function computeSkillCoverage(user) {
  const targetRole = user.profile?.targetRole;
  if (!targetRole) return null;

  const catalog = await RoleSkillCatalog.findOne({ role: targetRole }).select('requiredSkills').lean();
  if (!catalog || !Array.isArray(catalog.requiredSkills) || catalog.requiredSkills.length === 0) {
    return null;
  }

  const skillsByKey = new Map((user.currentSkillProfile?.skills ?? []).map((skill) => [skill.skillKey, skill]));

  let coveredWeight = 0;
  let totalWeight = 0;
  for (const required of catalog.requiredSkills) {
    totalWeight += required.weight;
    const skill = skillsByKey.get(required.skillKey);
    const covered =
      skill &&
      skill.assessed === true &&
      skill.level != null &&
      LEVEL_RANK[skill.level] >= LEVEL_RANK[required.minimumLevel];
    if (covered) coveredWeight += required.weight;
  }

  if (totalWeight === 0) return null;
  return (coveredWeight / totalWeight) * 100;
}

function average(values, field) {
  const present = values.map((v) => v[field]).filter((v) => typeof v === 'number' && Number.isFinite(v));
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

async function getReadiness(userId) {
  const user = await User.findById(userId).select('profile currentSkillProfile').lean();
  if (!user) throw new NotFoundError('User not found');

  const completed = await completedInterviewScores(userId);
  const count = completed.length;

  const technical = average(completed, 'technicalScore');
  const communication = average(completed, 'communicationScore');
  const skillCoverage = await computeSkillCoverage(user);

  const recentWindow = completed.slice(-SCORING_CONFIG.RECENT_WINDOW_MAX);
  const recentOverall = recentWindow.map((i) => i.overallScore);

  // Consistency: measured from >= 3 recent scores; with 1-2 completed
  // interviews it uses the neutral prior (docs/07 §6 cold start); with zero
  // completed interviews nothing is measured or assumed → null.
  const consistency =
    count === 0
      ? null
      : recentOverall.length >= 3
        ? 100 - clamp((sampleStddev(recentOverall) / SCORING_CONFIG.MAX_EXPECTED_STDDEV) * 100, 0, 100)
        : SCORING_CONFIG.NEUTRAL_PRIOR;

  // Improvement trend: measured from >= 2 recent scores, else neutral (1
  // interview), else null (0 interviews).
  const slope = count >= 2 ? linearRegressionSlope(recentOverall) : null;
  const improvementTrend =
    count === 0
      ? null
      : slope == null
        ? SCORING_CONFIG.NEUTRAL_PRIOR
        : clamp(50 + (slope / SCORING_CONFIG.MAX_EXPECTED_SLOPE) * 50, 0, 100);

  const components = { technical, communication, skillCoverage, consistency, improvementTrend };

  // Active (measured) components per docs/07 §6: components using a neutral
  // prior are excluded and the remaining weights are re-normalized to sum to 1.
  const active =
    count === 0
      ? []
      : count === 1
        ? ['technical', 'communication', 'skillCoverage']
        : count === 2
          ? ['technical', 'communication', 'skillCoverage', 'improvementTrend']
          : ['technical', 'communication', 'skillCoverage', 'consistency', 'improvementTrend'];

  let score = null;
  if (count > 0 && active.every((key) => components[key] != null)) {
    const weightSum = active.reduce((sum, key) => sum + SCORING_CONFIG.READINESS_WEIGHTS[key], 0);
    const weighted = active.reduce(
      (sum, key) => sum + SCORING_CONFIG.READINESS_WEIGHTS[key] * components[key],
      0
    );
    if (weightSum > 0) score = weighted / weightSum;
  }

  return {
    score,
    breakdown: {
      technical,
      communication,
      skillCoverage,
      consistency,
      improvementTrend,
    },
    interviewCount: count,
  };
}

async function getProgress(userId) {
  const completed = await completedInterviewScores(userId);
  return {
    points: completed.map((i) => ({
      interviewId: i._id,
      completedAt: i.completedAt,
      overallScore: i.overallScore,
    })),
  };
}

async function getPracticePlan(userId) {
  const user = await User.findById(userId).select('profile currentSkillProfile').lean();
  if (!user) throw new NotFoundError('User not found');

  const targetRole = user.profile?.targetRole ?? null;
  if (!targetRole) {
    return { targetRole: null, skillGaps: [] };
  }

  const catalog = await RoleSkillCatalog.findOne({ role: targetRole }).select('requiredSkills').lean();
  if (!catalog) {
    return { targetRole, skillGaps: [] };
  }

  // Deterministic gap list (docs/08 §7): required skill not in profile, or not
  // assessed, or assessed below the required minimum level. Catalog order is
  // used so the ordering is stable — no invented prioritization scoring.
  const skillsByKey = new Map((user.currentSkillProfile?.skills ?? []).map((skill) => [skill.skillKey, skill]));
  const skillGaps = [];
  for (const required of catalog.requiredSkills) {
    const skill = skillsByKey.get(required.skillKey);
    let reason = null;
    if (!skill) {
      reason = 'missing';
    } else if (skill.assessed !== true || skill.level == null) {
      reason = 'unassessed';
    } else if (LEVEL_RANK[skill.level] < LEVEL_RANK[required.minimumLevel]) {
      reason = 'under-level';
    }
    if (reason) {
      skillGaps.push({
        skillKey: required.skillKey,
        requiredMinimumLevel: required.minimumLevel,
        currentLevel: skill?.level ?? null,
        reason,
      });
    }
  }

  return { targetRole, skillGaps };
}

module.exports = { getReadiness, getProgress, getPracticePlan };
