// Single error-handling middleware. Returns the consistent error shape from
// docs/02-architecture-api.md §3: { error: { code, message, details } }.
// AppError instances (src/utils/errors.js) render their own code/status;
// anything else (a raw Error, a Mongoose error, a thrown string) is treated as
// an unexpected 500 with the sanitized INTERNAL_ERROR shape. Full error details
// (including stack traces) are logged server-side only and never leaked to the
// client in any environment.
const { AppError } = require('../utils/errors');

module.exports = function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  const _ = next;

  const isAppError = err instanceof AppError;

  const status = isAppError ? err.statusCode : 500;
  const response = isAppError
    ? {
        error: {
          code: err.code,
          message: err.message,
          details: err.details || {},
        },
      }
    : {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error',
          details: {},
        },
      };

  console.error(`[error] ${req.method} ${req.originalUrl}: ${err.stack || err}`);

  res.status(status).json(response);
};
