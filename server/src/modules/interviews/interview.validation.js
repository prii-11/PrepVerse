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

module.exports = { idParamSchema, answerBodySchema };
