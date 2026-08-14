// Validation middleware factory (docs/06-security.md §3). Defaults to
// validating req.body with a Zod schema and exposing the sanitized result as
// req.validatedBody; pass source 'query' or 'params' to validate those instead
// (exposed as req.validatedQuery / req.validatedParams). Failed validation is
// passed to the error middleware as a ValidationError carrying the raw Zod
// issues in details — never clamped or coerced.
const { ValidationError } = require('../utils/errors');

const validate = (schema, source = 'body') => {
  const target =
    source === 'query' ? 'validatedQuery' : source === 'params' ? 'validatedParams' : 'validatedBody';

  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      return next(
        new ValidationError(source === 'body' ? 'Invalid request body' : `Invalid request ${source}`, {
          issues: result.error.issues,
        })
      );
    }
    req[target] = result.data;
    next();
  };
};

module.exports = validate;
