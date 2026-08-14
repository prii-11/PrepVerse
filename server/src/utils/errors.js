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

module.exports = {
  AppError,
  NotFoundError,
  ValidationError,
  ConflictError,
  UnauthorizedError,
  RateLimitError,
};
