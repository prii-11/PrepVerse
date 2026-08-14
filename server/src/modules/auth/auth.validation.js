// Auth request validation (docs/06-security.md §1.2, §3; M3 §6).
// Password rules (M3 master prompt): min 8 chars, at most 1 repeated
// character, at least one uppercase, one lowercase, one digit. Applied before
// the controller runs via src/middleware/validate.js; controllers read
// req.validatedBody, never raw req.body.
const { z } = require('zod');

// "At most 1 repeated character": no more than one distinct character may
// appear more than once in the password.
function atMostOneRepeatedCharacter(password) {
  const seen = new Map();
  for (const ch of password) {
    seen.set(ch, (seen.get(ch) || 0) + 1);
  }
  const repeatedCount = [...seen.values()].filter((count) => count > 1).length;
  return repeatedCount <= 1;
}

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(atMostOneRepeatedCharacter, 'Password may contain at most 1 repeated character')
  .refine((p) => /[A-Z]/.test(p), 'Password must include an uppercase letter')
  .refine((p) => /[a-z]/.test(p), 'Password must include a lowercase letter')
  .refine((p) => /[0-9]/.test(p), 'Password must include a digit');

const registerSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required'),
  lastName: z.string().trim().min(1, 'Last name is required'),
  email: z.string().email('Enter a valid email address'),
  password: passwordSchema,
});

// Login validates shape only, not password strength — a wrong/short password
// must reach the service and produce the same 401 as an unknown email
// (enumeration protection, docs/06 §1.1.4). Strength rules are registration-time.
const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

module.exports = { registerSchema, loginSchema, passwordSchema };
