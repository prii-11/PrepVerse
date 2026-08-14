// AuthService — business logic for authentication (M3 §18). Owns registration,
// password hashing/verification, JWT issuance, /me lookup, logout behavior.
// Never touches req/res/next; throws the project's typed errors so the error
// middleware renders the standard envelope.
const bcrypt = require('bcryptjs');
const User = require('../users/user.model');
const jwt = require('../../utils/jwt');
const { toSafeUser } = require('../users/user.safe');
const { ConflictError, NotFoundError, UnauthorizedError } = require('../../utils/errors');

const BCRYPT_COST = 10; // docs/06 §1.2

async function register({ firstName, lastName, email, password }) {
  const normalizedEmail = email.toLowerCase();

  // Idempotency: one account per email (unique index on users.email). Pre-check
  // for a clean 409; the unique index backs it up under a race.
  const existing = await User.findOne({ email: normalizedEmail });
  if (existing) {
    throw new ConflictError('An account with this email already exists');
  }

  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

  let user;
  try {
    user = await User.create({ firstName, lastName, email: normalizedEmail, passwordHash });
  } catch (error) {
    // Duplicate-key error (code 11000) if two registrations pass the lookup
    // simultaneously. Convert to the same public conflict response — never
    // leak the raw MongoDB error (M3 §10).
    if (error && error.code === 11000) {
      throw new ConflictError('An account with this email already exists');
    }
    throw error;
  }

  // Registration auto-authenticates (docs/02 §3): issue a token immediately.
  const token = jwt.signAccessToken(user);
  return { token, user: toSafeUser(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() });

  // Enumeration protection (docs/06 §1.1.4): unknown email and wrong password
  // must produce byte-identical public responses.
  if (!user) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);

  // JWT issuance happens ONLY after successful password verification (M3 §5).
  if (!passwordValid) {
    throw new UnauthorizedError('Invalid credentials');
  }

  const token = jwt.signAccessToken(user);
  return { token, user: toSafeUser(user) };
}

async function me(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  return { user: toSafeUser(user) };
}

// Stateless JWT — the server revokes nothing. The client discards the token
// (docs/06 §1.1). No blacklist, no RefreshToken, no session record.
function logout() {
  return { message: 'Logged out' };
}

module.exports = { register, login, me, logout };
