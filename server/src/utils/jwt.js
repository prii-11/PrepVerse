// JWT helper (docs/06-security.md §1.1). The only place tokens are signed and
// verified. Stateless short-lived access token: payload exactly { userId, role }
// (role is always 'user' for MVP), expiry 15m, secret JWT_ACCESS_SECRET.
const jwt = require('jsonwebtoken');
const env = require('../config/env');

const ACCESS_TOKEN_TTL = '15m';

// Payload carries ONLY { userId, role } — no email, no password material, no
// user document. The middleware maps payload.userId -> req.user.id (§3 of the
// M3 contract: JWT claim is userId, request context property is id).
function signAccessToken(user) {
  return jwt.sign(
    { userId: user._id.toString(), role: 'user' },
    env.JWT_ACCESS_SECRET,
    { expiresIn: ACCESS_TOKEN_TTL }
  );
}

// Throws on invalid signature, expired, or malformed tokens — callers turn
// that into a 401.
function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_ACCESS_SECRET);
}

module.exports = { signAccessToken, verifyAccessToken, ACCESS_TOKEN_TTL };
