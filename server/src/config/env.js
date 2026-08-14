const dotenv = require('dotenv');

// Load .env before reading any environment variables.
dotenv.config({ quiet: true });

// Required at startup — missing any of these fails fast with a clear error.
// JWT_ACCESS_SECRET became required from M3 (authentication is active).
const REQUIRED_AT_STARTUP = ['MONGO_URI', 'PORT', 'CLIENT_ORIGIN', 'JWT_ACCESS_SECRET'];

const missing = REQUIRED_AT_STARTUP.filter((name) => !process.env[name]);

if (missing.length > 0) {
  console.error(`Missing required environment variables: ${missing.join(', ')}`);
  console.error('Copy server/.env.example to server/.env and set these values before starting.');
  process.exit(1);
}

module.exports = {
  MONGO_URI: process.env.MONGO_URI,
  PORT: Number(process.env.PORT),
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN,

  // JWT_ACCESS_SECRET is required from M3 (in REQUIRED_AT_STARTUP above) and is
  // the only secret-backed var today — never defaulted, no legacy JWT_SECRET.
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET,

  // Declared so later phases have a stable import, but NOT required at startup.
  // Each future module's own config layer is responsible for failing clearly
  // when its variable is missing — not env.js globally today.
  GEMINI_API_KEY: process.env.GEMINI_API_KEY, // required from M5 (AI)
  SUPABASE_URL: process.env.SUPABASE_URL, // required from M6 (storage)
  SUPABASE_KEY: process.env.SUPABASE_KEY, // required from M6 (storage)
};
