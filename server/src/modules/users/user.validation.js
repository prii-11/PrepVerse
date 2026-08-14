// Users module request validation (docs/06-security.md §3; M4.1).
// PATCH /users/me/profile accepts targetRole and/or experienceLevel.
// targetRole is catalog-backed (docs/05 §5): Zod checks it is a non-empty
// string; the service layer then verifies it against RoleSkillCatalog and
// throws a ValidationError with details.validOptions if it doesn't match
// (DB lookup can't run in the sync validate middleware). experienceLevel must
// be one of the exact enum values on the User model (docs/05 §2).
const { z } = require('zod');

const experienceLevels = ['Student', 'Entry', 'Junior'];

const updateProfileSchema = z
  .object({
    targetRole: z
      .string()
      .trim()
      .min(1, 'targetRole must be a non-empty string')
      .optional(),
    experienceLevel: z
      .enum(experienceLevels, 'experienceLevel must be one of: Student, Entry, Junior')
      .optional(),
  })
  .refine((data) => data.targetRole !== undefined || data.experienceLevel !== undefined, {
    message: 'Provide at least one of targetRole or experienceLevel',
  });

module.exports = { updateProfileSchema, experienceLevels };
