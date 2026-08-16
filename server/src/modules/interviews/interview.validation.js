// Interviews request validation (docs/06-security.md §3; M4.3).
// :id params must be syntactically valid ObjectIds BEFORE reaching the
// database — malformed values produce a 400 ValidationError via the validate
// middleware, never a raw Mongoose CastError. Answer bodies validate shape
// only; lifecycle/business rules live in the service.
const { z } = require('zod');

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid 24-character ObjectId'),
});

const answerBodySchema = z.object({
  questionId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'questionId must be a valid 24-character ObjectId'),
  text: z.string().trim().min(1, 'text must be a non-empty string'),
});

// POST /interviews body (docs/02 §3, docs/07 §3, M5.3). targetRole is checked
// against the RoleSkillCatalog in the service layer (DB lookup — not here);
// difficulty is the fixed enum; questionCount is optional (default 4) and
// bounded 3-5 exactly as documented. Unknown body keys (e.g. userId) are
// stripped by Zod's default behavior and never reach the service.
const createInterviewBodySchema = z.object({
  targetRole: z.string().trim().min(1, 'targetRole must be a non-empty string'),
  difficulty: z.enum(['easy', 'medium', 'hard'], 'difficulty must be one of easy, medium, hard'),
  questionCount: z
    .number()
    .int('questionCount must be an integer')
    .min(3, 'questionCount must be between 3 and 5')
    .max(5, 'questionCount must be between 3 and 5')
    .optional(),
});

module.exports = { idParamSchema, answerBodySchema, createInterviewBodySchema };
