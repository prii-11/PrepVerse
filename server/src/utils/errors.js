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

// Pre-check failure for empty/garbled resume text before any AI call.
// Per docs/07 §2: errorCode: RESUME_TEXT_EXTRACTION_FAILED.
class ResumeTextExtractionError extends AppError {
  constructor(message = 'Resume text extraction failed — empty or garbled input') {
    super('RESUME_TEXT_EXTRACTION_FAILED', message, 400);
  }
}

// Object storage (Supabase) failure — M6 (docs/17 D1). Deliberately distinct
// from AIProviderError: storage is its own upstream with its own taxonomy.
// `details.category` classifies the failure (AUTHENTICATION_FAILED |
// NOT_FOUND | CONFLICT | PAYLOAD_TOO_LARGE | STORAGE_UNAVAILABLE);
// `details.upstreamStatus` carries the HTTP status when one exists. The
// client makes ONE attempt per call (no retry loop — retry policy belongs to
// callers, mirroring the AI providers' single-attempt contract).
class StorageClientError extends AppError {
  constructor(message = 'Object storage request failed', details) {
    super('OBJECT_STORAGE_FAILED', message, 502, details);
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
  ResumeTextExtractionError,
  StorageClientError,
};
