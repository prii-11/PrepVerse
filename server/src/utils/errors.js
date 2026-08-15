// Typed application error classes (docs/02-architecture-api.md §3 error shape).
// Every known failure surfaced to clients is an AppError subclass; error.js
// identifies these via instanceof and renders the { error: { code, message,
// details } } envelope. Anything that is not an AppError is treated as an
// unexpected 500 (INTERNAL_ERROR).
class AppError extends Error {
  constructor(code, message, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found', details) {
    super('NOT_FOUND', message, 404, details);
  }
}

class ValidationError extends AppError {
  constructor(message = 'Validation failed', details) {
    super('VALIDATION_ERROR', message, 400, details);
  }
}

class ConflictError extends AppError {
  constructor(message = 'Conflict', details) {
    super('CONFLICT', message, 409, details);
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized', details) {
    super('UNAUTHORIZED', message, 401, details);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Too many requests', details) {
    super('RATE_LIMIT_EXCEEDED', message, 429, details);
  }
}

// AI provider failure (docs/07 §5 retry exhaustion; M5.1 §0.5.1). Deliberately
// distinct from RateLimitError: RateLimitError is the application's own
// request-rate limiting (middleware/rateLimit.js), while this represents the
// upstream AI provider (Gemini) failing or rate-limiting the app. The
// orchestrator may internally classify provider 429 responses for retry, but
// once retries are exhausted the propagated error is this typed AI-provider
// failure (502) — never a client-facing 429. `details.retryable` distinguishes
// an exhausted 429 sequence from a non-retryable provider/network failure for
// the orchestrator's backoff decision; `details.failure` records the final
// reason (RATE_LIMITED | SCHEMA_VALIDATION_FAILED | AI_PROVIDER_FAILED) which
// is also persisted as AIExecution.errorCode.
class AIProviderError extends AppError {
  constructor(message = 'AI provider request failed', details) {
    super('AI_PROVIDER_FAILED', message, 502, details);
  }
}

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  RateLimitError,
  AIProviderError,
};
