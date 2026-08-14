const dotenv = require('dotenv');

// Load .env before reading any environment variables.
dotenv.config({ quiet: true });

// Required for M2.1 startup. Missing any of these fails fast with a clear error.
const REQUIRED_AT_STARTUP = ['MONGO_URI', 'PORT', 'CLIENT_ORIGIN'];

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

  // Declared now so later phases have a stable import, but NOT required for
  // M2.1 startup. Each future module's own config layer is responsible for
  // failing clearly when its variable is missing — not env.js globally today.
  JWT_ACCESS_SECRET: process.env.JWT_ACCESS_SECRET, // required from M3 (auth)
  GEMINI_API_KEY: process.env.GEMINI_API_KEY, // required from M5 (AI)
  SUPABASE_URL: process.env.SUPABASE_URL, // required from M6 (storage)
  SUPABASE_KEY: process.env.SUPABASE_KEY, // required from M6 (storage)
};
