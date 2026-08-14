const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// General IP-based rate limiter (docs/06-security.md §0.1) — applies to all
// routes, including login attempts. In-memory store, no Redis needed.
// 100 requests per 15 minutes per IP (ipKeyGenerator handles IPv6 correctly);
// standard RateLimit-* headers emitted; legacy X-* headers disabled.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  limit: 100, // 100 requests per IP per window
  keyGenerator: ipKeyGenerator,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
      details: {},
    },
  },
});

// Per-user AI rate limiter (docs/06-security.md §0.1, second tier) — stub for
// M2.1, filled in M5. No-op passthrough for now.
const aiRateLimit = (req, res, next) => {
  next();
};

module.exports = generalLimiter;
module.exports.aiRateLimit = aiRateLimit;
