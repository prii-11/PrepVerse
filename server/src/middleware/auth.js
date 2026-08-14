// Authentication middleware (docs/06-security.md §1.1, M3 §13).
// Verifies the Bearer JWT (signature + expiry via jsonwebtoken) and attaches
// ONLY the authenticated identity to req.user:
//   req.user = { id: payload.userId, role: payload.role }
// JWT claim is userId; the request context property is id — never collapse the
// two, and never attach the full User document. Missing/invalid/expired/
// tampered tokens all yield the same 401 UNAUTHORIZED envelope.
const jwt = require('../utils/jwt');
const { UnauthorizedError } = require('../utils/errors');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new UnauthorizedError('Authentication required'));
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(new UnauthorizedError('Authentication required'));
  }

  let payload;
  try {
    payload = jwt.verifyAccessToken(token);
  } catch {
    return next(new UnauthorizedError('Authentication required'));
  }

  req.user = { id: payload.userId, role: payload.role };
  next();
}

module.exports = { requireAuth };
