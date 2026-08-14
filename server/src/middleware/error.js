// Single error-handling middleware. Returns the consistent error shape from
// docs/02-architecture-api.md §3: { error: { code, message, details } }.
// Full error details (including stack traces) are logged server-side only and
// never leaked to the client in any environment.
module.exports = function errorHandler(err, req, res, next) {
  // eslint-disable-next-line no-unused-vars
  const _ = next;

  const isKnownError = Boolean(err.code);
  const status = err.statusCode >= 400 && err.statusCode < 600 ? err.statusCode : 500;

  const response = {
    error: {
      code: isKnownError ? err.code : 'INTERNAL_ERROR',
      message: isKnownError ? err.message || 'Request failed' : 'Internal server error',
      details: err.details || {},
    },
  };

  console.error(`[error] ${req.method} ${req.originalUrl}: ${err.stack || err}`);

  res.status(status).json(response);
};
