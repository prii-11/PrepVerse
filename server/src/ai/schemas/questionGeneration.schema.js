// Question Generation structured output — docs/07 §3, exact contract. Reused
// by the orchestrator and the future QuestionGenerator (M5.3).
//
// Context-dependent rules (docs/07 §3 validation rules) are encoded via the
// factory: `questions.length === questionCount` exactly, duplicate-text
// detection (case-insensitive) at the validation layer, and enum constraints.
//
// `category` is constrained to the authoritative enum resolved in docs/07 §3
// (M5.3 pre-flight): algorithms | data-structures | system-design | database |
// api-design | debugging | concurrency | behavioral. docs/05 §4 stores category
// as a plain String; this enum is the validation-layer allowlist.
const { z } = require('zod');

// Canonical skillKey format (AGENTS.md rule 5): lowercase slug keys such as
// "mongodb", "system-design". Enforcing the canonical FORMAT here is possible
// without DB access; membership in RoleSkillCatalog's required-skill universe
// requires the catalog and is deferred to the operation module (M5.3), which
// has it in scope — noted as a documented deferral, not silently dropped.
const canonicalSkillKey = z
  .string()
  .min(1)
  .regex(/^[a-z][a-z0-9_-]*$/, 'skillKey must be a canonical lowercase slug');

const expectedTopicSchema = z.object({
  skillKey: canonicalSkillKey,
  topic: z.string().min(1, 'topic must be non-empty'),
});

const questionSchema = z.object({
  // docs/07 §3 output shape includes id; the id is server-owned and never
  // trusted from client input, so M5.3 may reassign it before persisting.
  id: z.string().min(1),
  text: z.string().min(1, 'question text must be non-empty'),
  category: z.enum(['algorithms', 'data-structures', 'system-design', 'database', 'api-design', 'debugging', 'concurrency', 'behavioral']),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  expectedTopics: z.array(expectedTopicSchema), // max 5 enforced in sanitize (docs/07 §3)
});

// `questionCount` comes from the operation input contract (docs/07 §3), so the
// schema is built per-run — Zod has no way to reference a request-time value
// from a static schema.
function createQuestionGenerationSchema(questionCount) {
  return z
    .object({
      // Exact count — docs/07 §3: fewer questions → correction retry, never
      // silently proceeding with a short list.
      questions: z.array(questionSchema).length(questionCount),
    })
    .superRefine((data, ctx) => {
      const seen = new Set();
      data.questions.forEach((question, index) => {
        const normalized = question.text.trim().toLowerCase();
        if (seen.has(normalized)) {
          ctx.addIssue({
            code: 'custom',
            message: 'duplicate question text (case-insensitive)',
            path: ['questions', index, 'text'],
          });
        }
        seen.add(normalized);
      });
    });
}

// Docs/07 §3 caps. Applied only after schema validation succeeds (M5.1 §11).
function sanitizeQuestionGeneration(output) {
  return {
    ...output,
    questions: output.questions.map((question) => ({
      ...question,
      expectedTopics: question.expectedTopics.slice(0, 5),
    })),
  };
}

module.exports = { createQuestionGenerationSchema, sanitizeQuestionGeneration, canonicalSkillKey };
