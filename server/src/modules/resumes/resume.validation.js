// Resumes request validation (docs/06-security.md §3; M4.2).
// The :id param must be a syntactically valid MongoDB ObjectId BEFORE it
// reaches the database — an invalid format produces a 400 ValidationError via
// the validate middleware, never a raw Mongoose CastError. Validate params
// via the 'params' source so it lands on req.validatedParams.
const { z } = require('zod');

const idParamSchema = z.object({
  id: z.string().regex(/^[0-9a-fA-F]{24}$/, 'id must be a valid 24-character ObjectId'),
});

module.exports = { idParamSchema };
