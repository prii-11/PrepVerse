// Answer Evaluation structured output — docs/07 §4, exact contract. Reused by
// the orchestrator and the future AnswerEvaluator (M5.4).
//
// Structural rules from docs/07 §3/§4 encoded in the factory:
//   - `topicAssessments[].skillKey` must be a subset of the question's
//     expected-topic skill keys.
//   - `topicAssessments[].skillKey` values must be unique within one answer
//     evaluation (duplicates are a validation failure, never silently
//     deduplicated).
//   - If `expectedTopics` is non-empty, `topicAssessments` must be non-empty.
//   - `addressed: false` is valid and contributes no skill evidence.
//
// Numeric scoring: schema enforces [0,100] STRICTLY (M5.1 §10) — a 105 is a
// schema-validation failure that enters the correction-retry path; it is
// NEVER clamped into range. The post-validation clamp in sanitize is the
// defensive belt-and-suspenders pass docs/07 §4 permits on already-valid
// values, not a way to rescue an invalid one.
const { z } = require('zod');

const score = z.number().min(0, 'score must be >= 0').max(100, 'score must be <= 100');

const topicAssessmentSchema = z.object({
  skillKey: z.string().min(1, 'skillKey must be non-empty'),
  addressed: z.boolean(),
  quality: z.enum(['missing', 'weak', 'good', 'strong']),
});

// `expectedTopics` comes from the question being evaluated (docs/07 §4 input
// contract), so the schema is built per-run.
function createAnswerEvaluationSchema(expectedTopics = []) {
  const expectedKeys = expectedTopics.map((t) => t.skillKey);
  const expectedKeySet = new Set(expectedKeys);

  return z
    .object({
      correctness: score,
      technicalDepth: score,
      communication: score,
      strengths: z.array(z.string()), // max 5 enforced in sanitize (docs/07 §4)
      weaknesses: z.array(z.string()), // max 5 enforced in sanitize (docs/07 §4)
      improvementTip: z.string().min(1, 'improvementTip must be non-empty'), // max 200 in sanitize
      topicAssessments: z.array(topicAssessmentSchema),
    })
    .superRefine((data, ctx) => {
      const keys = data.topicAssessments.map((t) => t.skillKey);

      if (new Set(keys).size !== keys.length) {
        ctx.addIssue({ code: 'custom', message: 'topicAssessments skillKey values must be unique' });
      }

      for (const key of keys) {
        if (!expectedKeySet.has(key)) {
          ctx.addIssue({
            code: 'custom',
            message: `topicAssessments skillKey '${key}' is not in the question's expectedTopics`,
          });
        }
      }

      if (expectedKeys.length > 0 && data.topicAssessments.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'topicAssessments must be non-empty when expectedTopics is non-empty' });
      }
    });
}

// Docs/07 §4 caps + defensive numeric clamp. Applied only after schema
// validation succeeds (M5.1 §11). The score clamp is a no-op for schema-valid
// input by construction; string/array caps are the real work here.
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function sanitizeAnswerEvaluation(output) {
  return {
    ...output,
    correctness: clamp(output.correctness, 0, 100),
    technicalDepth: clamp(output.technicalDepth, 0, 100),
    communication: clamp(output.communication, 0, 100),
    strengths: output.strengths.slice(0, 5),
    weaknesses: output.weaknesses.slice(0, 5),
    improvementTip: output.improvementTip.length > 200 ? output.improvementTip.slice(0, 200) : output.improvementTip,
  };
}

module.exports = { createAnswerEvaluationSchema, sanitizeAnswerEvaluation };
