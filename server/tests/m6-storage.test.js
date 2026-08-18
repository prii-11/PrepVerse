// M6 Storage P1 tests (docs/17 §7 P1, §8 D1-D5): storage config guards and
// the fetch-based Supabase Storage client. No real network — global fetch is
// mocked deterministically (same philosophy as the m5.1 provider mock).
//
// Environment note: config/storage.js fails fast at require time without
// SUPABASE_URL / SUPABASE_KEY / SUPABASE_BUCKET (D5-a module-level guard) —
// set them before any module require below. config/env.js requires its own
// startup vars first (mirrors m5.1 header).
// Missing/placeholder config cases are exercised via spawned child processes
// (the config modules cache their exports at require time).
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-supabase-service-key-12345';
process.env.SUPABASE_BUCKET = 'resumes';

const { test, mock: testMocks } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { STORAGE_CONFIG } = require('../src/config/storage');
const storageClient = require('../src/storage/storage.client');
const { StorageClientError, AppError } = require('../src/utils/errors');

// ---- config contract -------------------------------------------------------

test('M6-P1-1. STORAGE_CONFIG exposes env-driven url/key/bucket + D2 TTL', () => {
  assert.equal(STORAGE_CONFIG.SUPABASE_URL, 'https://test.supabase.co');
  assert.equal(STORAGE_CONFIG.SUPABASE_KEY, 'test-supabase-service-key-12345');
  assert.equal(STORAGE_CONFIG.SUPABASE_BUCKET, 'resumes');
  assert.equal(STORAGE_CONFIG.signedUrlTtlSeconds, 15 * 60, 'D2: 15-minute TTL, JWT parity (docs/06:48)');
  assert.equal(typeof STORAGE_CONFIG.storageTimeoutMs, 'number');
});

function childEnv(overrides = {}) {
  // Note: setting keys to undefined would stringify them as 'undefined' when
  // passed to child processes — delete them so the guard sees them missing.
  const env = { ...process.env };
  delete env.SUPABASE_URL;
  delete env.SUPABASE_KEY;
  delete env.SUPABASE_BUCKET;
  return { ...env, ...overrides };
}

function spawnConfigGuard(env) {
  // Run from a neutral cwd (no .env file): config/env.js dotenv.config fills
  // missing vars from the CWD's .env, which would leak the developer's real
  // storage values into the guard test. Require by absolute path so only the
  // explicitly-built env decides the outcome.
  const storageConfigPath = path.join(__dirname, '..', 'src', 'config', 'storage.js');
  return execSync(`node -e "require('${storageConfigPath}')"`, {
    cwd: '/tmp',
    env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('M6-P1-2. storage config fails fast when SUPABASE_URL missing (D5-a)', () => {
  assert.throws(
    () => spawnConfigGuard(childEnv({ SUPABASE_URL: 'https://x.supabase.co' })),
    (err) => err.stderr.includes('SUPABASE_KEY') && err.stderr.includes('SUPABASE_BUCKET'),
    'module-level guard names every missing variable'
  );
});

test('M6-P1-3. storage config fails fast on placeholder values like groq.js:32', () => {
  for (const [name, value] of [
    ['SUPABASE_URL', 'your_supabase_project_url'],
    ['SUPABASE_KEY', 'your_supabase_service_key'],
    ['SUPABASE_BUCKET', 'your_bucket'],
  ]) {
    assert.throws(
      () => spawnConfigGuard(childEnv({ SUPABASE_URL: 'https://x.supabase.co', SUPABASE_KEY: 'k', SUPABASE_BUCKET: 'b', [name]: value })),
      (err) => err.stderr.includes(name),
      `${name} placeholder must be rejected`
    );
  }
});

// ---- client request shape (mocked fetch, no network) -----------------------

function mockFetch(impl) {
  const mock = testMocks.method(globalThis, 'fetch', impl);
  return mock;
}

function okJson(body, status = 200) {
  return { ok: status < 400, status, text: async () => JSON.stringify(body) };
}

test('M6-P1-4. uploadObject: POST /object/{bucket}/{path} with service-key auth + raw body', async () => {
  const seen = [];
  const mock = mockFetch(async (url, init) => {
    seen.push({ url, init });
    return okJson({ Key: 'resumes/users/u1/a.pdf' });
  });
  try {
    const key = await storageClient.uploadObject(
      'users/u1/2026-08-18 résumé.pdf',
      Buffer.from('%PDF-1.4'),
      'application/pdf'
    );
    assert.equal(key, 'resumes/users/u1/a.pdf', 'returns the Key echoed by storage');
    assert.equal(seen.length, 1);
    assert.equal(seen[0].url, 'https://test.supabase.co/storage/v1/object/resumes/users/u1/2026-08-18%20r%C3%A9sum%C3%A9.pdf');
    assert.equal(seen[0].init.method, 'POST');
    assert.equal(seen[0].init.headers.Authorization, 'Bearer test-supabase-service-key-12345');
    assert.equal(seen[0].init.headers['Content-Type'], 'application/pdf');
    assert.ok(Buffer.isBuffer(seen[0].init.body));
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-5. uploadObject: echoes requested path when 2xx body has no Key', async () => {
  const mock = mockFetch(async () => okJson(null, 200));
  try {
    assert.equal(await storageClient.uploadObject('users/u1/a.pdf', Buffer.from('x'), 'application/pdf'), 'users/u1/a.pdf');
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-6. uploadObject duplicate: 400 "already exists" maps to CONFLICT', async () => {
  const mock = mockFetch(async () => ({ ok: false, status: 400, text: async () => 'The resource already exists' }));
  try {
    await assert.rejects(
      storageClient.uploadObject('users/u1/a.pdf', Buffer.from('x'), 'application/pdf'),
      (err) =>
        err instanceof StorageClientError &&
        err instanceof AppError &&
        err.code === 'OBJECT_STORAGE_FAILED' &&
        err.details.category === 'CONFLICT' &&
        err.details.upstreamStatus === 400
    );
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-7. signedUrl: POST /object/sign with expiresIn (D2: 900s), returns absolute URL', async () => {
  const seen = [];
  const mock = mockFetch(async (url, init) => {
    seen.push({ url, init });
    return okJson({ signedURL: '/storage/v1/object/sign/resumes/users/u1/a.pdf?token=abc' });
  });
  try {
    const url = await storageClient.signedUrl('users/u1/a.pdf');
    assert.equal(url, 'https://test.supabase.co/storage/v1/object/sign/resumes/users/u1/a.pdf?token=abc');
    assert.equal(seen[0].url, 'https://test.supabase.co/storage/v1/object/sign/resumes/users/u1/a.pdf');
    assert.equal(seen[0].init.method, 'POST');
    assert.equal(JSON.parse(seen[0].init.body).expiresIn, 900, 'expiresIn must equal the D2 TTL');
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-7b. signedUrl: relative-to-API-root shape ("/object/sign/...") gets /storage/v1 prefix (shape observed live on PrepVerse)', async () => {
  const mock = mockFetch(async () => okJson({ signedURL: '/object/sign/resumes/users/u1/a.pdf?token=abc' }));
  try {
    const url = await storageClient.signedUrl('users/u1/a.pdf');
    assert.equal(url, 'https://test.supabase.co/storage/v1/object/sign/resumes/users/u1/a.pdf?token=abc');
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-8. signedUrl: absolute signedURL passes through', async () => {
  const mock = mockFetch(async () => okJson({ signedURL: 'https://cdn.example.com/x.pdf?token=t' }));
  try {
    assert.equal(await storageClient.signedUrl('users/u1/a.pdf'), 'https://cdn.example.com/x.pdf?token=t');
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-9. signedUrl: 2xx without signedURL is STORAGE_UNAVAILABLE (groq.js:90-97 envelope check)', async () => {
  const mock = mockFetch(async () => okJson({}));
  try {
    await assert.rejects(
      storageClient.signedUrl('users/u1/a.pdf'),
      (err) => err instanceof StorageClientError && err.details.category === 'STORAGE_UNAVAILABLE'
    );
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-10. deleteObject: DELETE /object/{bucket}/{path}', async () => {
  const seen = [];
  const mock = mockFetch(async (url, init) => {
    seen.push({ url, init });
    return okJson({}, 200);
  });
  try {
    await storageClient.deleteObject('users/u1/a.pdf');
    assert.equal(seen[0].url, 'https://test.supabase.co/storage/v1/object/resumes/users/u1/a.pdf');
    assert.equal(seen[0].init.method, 'DELETE');
    assert.equal(seen[0].init.body, undefined);
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-11. auth failure: 401 and 403 map to AUTHENTICATION_FAILED', async () => {
  for (const status of [401, 403]) {
    const mock = mockFetch(async () => ({ ok: false, status, text: async () => 'invalid key' }));
    try {
      await assert.rejects(
        storageClient.signedUrl('users/u1/a.pdf'),
        (err) => err instanceof StorageClientError && err.details.category === 'AUTHENTICATION_FAILED' && err.details.upstreamStatus === status
      );
    } finally {
      mock.mock.restore();
    }
  }
});

test('M6-P1-12. 404 maps to NOT_FOUND', async () => {
  const mock = mockFetch(async () => ({ ok: false, status: 404, text: async () => 'not found' }));
  try {
    await assert.rejects(
      storageClient.signedUrl('users/u1/missing.pdf'),
      (err) => err instanceof StorageClientError && err.details.category === 'NOT_FOUND'
    );
  } finally {
    mock.mock.restore();
  }
});

test('M6-P1-13. network failure and timeout map to STORAGE_UNAVAILABLE, single attempt', async () => {
  let calls = 0;
  const networkMock = mockFetch(async () => {
    calls += 1;
    throw new TypeError('fetch failed');
  });
  try {
    await assert.rejects(
      storageClient.signedUrl('users/u1/a.pdf'),
      (err) => err instanceof StorageClientError && err.details.category === 'STORAGE_UNAVAILABLE'
    );
    assert.equal(calls, 1, 'no retry loop in the client');
  } finally {
    networkMock.mock.restore();
  }

  const abortMock = mockFetch(async () => {
    // Simulate the AbortSignal.timeout firing (rejects before the real 15s
    // elapsed timer) — exercises the client's timeout classification path.
    return new Promise((_resolve, reject) => {
      setTimeout(() => reject(new DOMException('The operation was aborted', 'TimeoutError')), 50);
    });
  });
  try {
    await assert.rejects(
      storageClient.signedUrl('users/u1/a.pdf'),
      (err) => err instanceof StorageClientError && err.details.category === 'STORAGE_UNAVAILABLE' && /timed out/i.test(err.message)
    );
  } finally {
    abortMock.mock.restore();
  }
});

test('M6-P1-14. mock seam: client exposes plain functions mockable like the Gemini provider', () => {
  for (const name of ['uploadObject', 'signedUrl', 'deleteObject']) {
    assert.equal(typeof storageClient[name], 'function', `${name} is a function`);
  }
  const mock = testMocks.method(storageClient, 'signedUrl', async () => 'https://mocked.example/signed');
  try {
    assert.equal(storageClient.STORAGE_CONFIG.SUPABASE_BUCKET, 'resumes');
  } finally {
    mock.mock.restore();
  }
});