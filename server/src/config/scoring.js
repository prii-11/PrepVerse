// Centralized scoring configuration (docs/07-ai-contracts.md §6, resolved
// gaps). The normalization constants are proposed defaults, deliberately
// tunable once real interview data exists — they are NEVER re-declared as
// inline magic numbers inside analytics code; everything below is imported.
// Readiness weights are the finalized Design 7 weights (docs/02 §4.2).
const SCORING_CONFIG = {
  // overallScore is bounded [0,100]; with sample stddev, a stddev of 50 across
  // a small 3-5 point window is already near-maximal volatility. stddev >=
  // MAX_EXPECTED_STDDEV saturates the volatility component → consistency = 0.
  MAX_EXPECTED_STDDEV: 50,

  // A candidate moving >= 20 overallScore points per interview (sustained
  // across the window) is a strong, clearly-visible trend given scores are
  // bounded [0,100]. slope = 0 → improvementTrend = 50 (neutral); saturates to
  // 100 at +20/interview and to 0 at -20/interview.
  MAX_EXPECTED_SLOPE: 20,

  // Neutral prior used by consistency/improvementTrend during cold start
  // (docs/07 §6): 1 interview → both neutral; 2 interviews → trend measured,
  // consistency still neutral.
  NEUTRAL_PRIOR: 50,

  // Consistency/improvementTrend windows: the most recent completed scores,
  // per the "last 3-5 overallScores" rule in docs/07 §6.
  RECENT_WINDOW_MAX: 5,

  // Finalized readiness weights (docs/02 §4.2 / docs/07 §6). During cold
  // start the neutral-prior components are excluded and the active weights are
  // re-normalized to sum to 1.
  READINESS_WEIGHTS: {
    technical: 0.35,
    communication: 0.2,
    skillCoverage: 0.25,
    consistency: 0.1,
    improvementTrend: 0.1,
  },

  // M5.4 answer-evaluation weights (docs/07 §4, resolved MVP formulas) — used
  // by the InterviewService report aggregation, never by the AI layer (the
  // LLM is never asked for an overall score). Proposed defaults, tunable
  // once real interview data exists — same status as the readiness weights.
  EVALUATION_WEIGHTS: {
    overall: { correctness: 0.5, technicalDepth: 0.3, communication: 0.2 },
    technical: { correctness: 0.6, technicalDepth: 0.4 },
  },

  // M5.4 report aggregation caps (docs/02 §3): report.strengths / weaknesses /
  // recommendations aggregate the COMPLETED answers' per-answer fields,
  // case-insensitive dedup with first occurrence winning, max 5.
  REPORT_CAPS: {
    strengths: 5,
    weaknesses: 5,
    recommendations: 5,
  },
};

module.exports = { SCORING_CONFIG };
