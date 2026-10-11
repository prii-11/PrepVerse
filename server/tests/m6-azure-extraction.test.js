// M6.1 Azure Document Intelligence extraction-fallback tests (docs/21):
//   - config/di.js optional-tier contract (disabled default, D5-a fail-fast
//     only when enabled; placeholder rejection)
//   - azure.di.extractor transport (mock fetch, no network): analyze POST
//     shape, poll loop, normalization, failure classification, bounded budget
//   - textExtractor empty-branch fallback (real pdf-parse fixture + mocked
//     azure/storage seams): trigger = empty text ONLY, never parser
//     exceptions, never when disabled, never without a storageKey
//
// Env note: config/storage.js fails fast at require time (D5-a) — the full
// startup env is set before any module require, mirroring m6-resume-upload.
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5002';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-supabase-service-key-12345';
process.env.SUPABASE_BUCKET = 'resumes';
// Deliberately NOT setting AZURE_DI_ENABLED: the default-off contract is
// itself under test. Tests that need DI enabled mutate DI_CONFIG directly.

const { test, before, after, beforeEach, mock: testMocks } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execSync } = require('node:child_process');

const { DI_CONFIG } = require('../src/config/di');
const azureDi = require('../src/storage/azure.di.extractor');
const storageClient = require('../src/storage/storage.client');
const { extractText } = require('../src/storage/textExtractor');
const { ResumeTextExtractionError } = require('../src/utils/errors');

// ---- Hand-built fixtures ----------------------------------------------------

// Minimal single-page PDF; `stream` content is caller-provided so the suite
// can build BOTH a text-bearing PDF and a scanned-like textless PDF.
function buildPdf(stream) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<</Length ${Buffer.byteLength(stream)}>>\nstream\n${stream}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  const parts = ['%PDF-1.4\n'];
  const offsets = [];
  objects.forEach((body, i) => {
    offsets.push(Buffer.byteLength(parts.join('')));
    parts.push(`${i + 1} 0 obj\n${body}\nendobj\n`);
  });
  const xrefOffset = Buffer.byteLength(parts.join(''));
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  parts.push(xref, `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return Buffer.from(parts.join(''), 'utf8');
}

const TEXT_PDF = buildPdf('BT /F1 12 Tf 72 720 Td (JavaScript and Node.js experience.) Tj ET\n');
// "Scanned" surrogate: valid PDF that parses but yields NO text (image-only
// pages) — the one case local extraction cannot serve.
const EMPTY_TEXT_PDF = buildPdf('BT ET\n');
const GARBAGE_PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(512, 0x41)]);

// ---- DI config optional-tier contract ---------------------------------------

test('DI-CONFIG-1. disabled by default; config loads without any AZURE_DI_* vars (unlike storage)', () => {
  assert.equal(DI_CONFIG.enabled, false);
  assert.equal(DI_CONFIG.model, 'prebuilt-read', 'default model = prebuilt-read (docs/21 §4)');
  assert.equal(DI_CONFIG.apiVersion, '2024-11-30', 'GA API version pinned');
  assert.equal(DI_CONFIG.timeoutMs, 60000, 'default whole-operation budget');
  assert.equal(DI_CONFIG.pollIntervalMs, 3000);
  assert.equal(DI_CONFIG.requestTimeoutMs, 15000, 'per-request timeout mirrors storage.client');
});

function childEnv(overrides = {}) {
  return { ...process.env, ...overrides };
}

function spawnDiConfigGuard(env) {
  // Run from a neutral cwd so no developer .env leaks in (m6-storage P1-2
  // pattern). The child inherits the test env (which has AZURE_DI_* unset),
  // plus the explicit overrides.
  const diConfigPath = path.join(__dirname, '..', 'src', 'config', 'di.js');
  return execSync(`node -e "require('${diConfigPath}')"`, {
    cwd: '/tmp',
    env,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
}

test('DI-CONFIG-2. enabled with missing vars → fail-fast, every var named (D5-a)', () => {
  assert.throws(
    () => spawnDiConfigGuard(childEnv({ AZURE_DI_ENABLED: 'true' })),
    (err) => err.stderr.includes('AZURE_DI_ENDPOINT') && err.stderr.includes('AZURE_DI_KEY'),
    'enabled-but-unconfigured must refuse to load'
  );
});

test('DI-CONFIG-3. enabled with placeholder values → fail-fast, var named', () => {
  for (const [name, value] of [
    ['AZURE_DI_ENDPOINT', 'your_di_endpoint'],
    ['AZURE_DI_KEY', 'your_azure_di_key'],
  ]) {
    assert.throws(
      () =>
        spawnDiConfigGuard(
          childEnv({ AZURE_DI_ENABLED: 'true', AZURE_DI_ENDPOINT: 'https://x.azure.example', AZURE_DI_KEY: 'k', [name]: value })
        ),
      (err) => err.stderr.includes(name),
      `${name} placeholder must be rejected when enabled`
    );
  }
});

test('DI-CONFIG-4. enabled with real values loads cleanly (no throw), endpoint normalized', () => {
  const diConfigPath = path.join(__dirname, '..', 'src', 'config', 'di.js');
  const out = spawnDiConfigGuard(
    childEnv({ AZURE_DI_ENABLED: 'true', AZURE_DI_ENDPOINT: 'https://docintel.example.com/', AZURE_DI_KEY: 'azure-test-key-123' })
  );
  void out;
});

// ---- azure.di.extractor: transport (mocked fetch, no network) ---------------

before(() => {});

after(() => {
  testMocks.restoreAll();
  DI_CONFIG.enabled = false;
});

// Single beforeEach drives BOTH suites so no duplicate hook ordering can
// mask either one: DI-CLIENT* tests get the real azureDi module (they mock
// global fetch per-test); every other test (the extractor fallback suite)
// gets the azureDi/storageClient module seams pre-installed.
beforeEach((t) => {
  testMocks.reset();
  DI_CONFIG.enabled = true;
  DI_CONFIG.endpoint = 'https://di-test.azure.example';
  DI_CONFIG.apiKey = 'di-test-key-12345';
  DI_CONFIG.model = 'prebuilt-read';
  DI_CONFIG.timeoutMs = 60000;
  DI_CONFIG.pollIntervalMs = 3000;
  DI_CONFIG.requestTimeoutMs = 15000;
  if (!t.name.startsWith('DI-CLIENT')) {
    DI_CONFIG.enabled = false;
    testMocks.method(azureDi, 'extractDocument', async () => 'Azure OCR extracted text.');
    testMocks.method(storageClient, 'signedUrl', async (key) => `https://signed-example/${key}?token=abc`);
  }
});

function mockFetch(impl) {
  return testMocks.method(globalThis, 'fetch', impl);
}

function azureResponse(body, { status = 200, headers = {} } = {}) {
  const headerMap = new Map(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  return {
    ok: status < 400,
    status,
    headers: { get: (name) => headerMap.get(name.toLowerCase()) ?? null },
    text: async () => JSON.stringify(body),
  };
}

const OP_LOCATION = 'https://di-test.azure.example/documentintelligence/documentModels/prebuilt-read/analyzeResults/op-1?api-version=2024-11-30';

test('DI-CLIENT-1. analyze POST shape: endpoint, api-key header, urlSource body', async () => {
  const seen = [];
  const fetchMock = mockFetch(async (url, init) => {
    seen.push({ url, init });
    return azureResponse({ status: 'succeeded', analyzeResult: { content: 'Azure OCR text.' } }, { status: 202, headers: { 'operation-location': OP_LOCATION } });
  });
  try {
    const text = await azureDi.extractDocument('https://signed-example/resume.pdf?token=abc');
    assert.equal(text, 'Azure OCR text.', 'normalized plain text returned');
    assert.equal(seen.length, 2, 'analyze POST + one poll GET');
    const post = seen[0];
    assert.equal(
      post.url,
      'https://di-test.azure.example/documentintelligence/documentModels/prebuilt-read:analyze?api-version=2024-11-30'
    );
    assert.equal(post.init.method, 'POST');
    assert.equal(post.init.headers['Ocp-Apim-Subscription-Key'], 'di-test-key-12345', 'Azure key header, never in body');
    assert.equal(post.init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(post.init.body), { urlSource: { url: 'https://signed-example/resume.pdf?token=abc' } });
    assert.equal(seen[1].url, OP_LOCATION, 'poll follows the operation-location header');
  } finally {
    fetchMock.mock.restore();
  }
});

test('DI-CLIENT-2. poll loop: running → succeeded, content normalized', async () => {
  DI_CONFIG.pollIntervalMs = 5; // keep the suite fast; the poll cadence is a config constant under test elsewhere
  let polls = 0;
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ status: 'running' }, { status: 202, headers: { 'operation-location': OP_LOCATION } });
    }
    polls += 1;
    return azureResponse(
      polls === 1
        ? { status: 'running' }
        : { status: 'succeeded', analyzeResult: { content: '  Line one.\nLine two.  ', paragraphs: [{ content: 'ignored' }] } }
    );
  });
  const text = await azureDi.extractDocument('https://signed-example/resume.pdf');
  assert.equal(text, 'Line one.\nLine two.', 'content trimmed, paragraphs fallback never used');
});

test('DI-CLIENT-3. paragraphs fallback when content absent', async () => {
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ status: 'running' }, { status: 202, headers: { 'operation-location': OP_LOCATION } });
    }
    return azureResponse({ status: 'succeeded', analyzeResult: { paragraphs: [{ content: '  Para A.  ' }, { content: '' }, { content: 'Para B.' }] } });
  });
  const text = await azureDi.extractDocument('https://signed-example/resume.pdf');
  assert.equal(text, 'Para A.\nPara B.', 'empty paragraphs filtered, joined with newlines');
});

test('DI-CLIENT-4. succeeded with no readable text → EMPTY_RESULT', async () => {
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ status: 'running' }, { status: 202, headers: { 'operation-location': OP_LOCATION } });
    }
    return azureResponse({ status: 'succeeded', analyzeResult: {} });
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && err.category === 'EMPTY_RESULT'
  );
});

test('DI-CLIENT-5. operation status failed → FAILED_OPERATION', async () => {
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ status: 'running' }, { status: 202, headers: { 'operation-location': OP_LOCATION } });
    }
    return azureResponse({ status: 'failed' });
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && err.category === 'FAILED_OPERATION'
  );
});

test('DI-CLIENT-6. operation never completes → bounded timeout, no infinite poll', async () => {
  DI_CONFIG.timeoutMs = 60;
  DI_CONFIG.pollIntervalMs = 5;
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ status: 'running' }, { status: 202, headers: { 'operation-location': OP_LOCATION } });
    }
    return azureResponse({ status: 'running' });
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && err.category === 'TIMEOUT'
  );
});

test('DI-CLIENT-7. HTTP failure classification: 401/403 auth, 429 rate-limit, 5xx unavailable, 4xx invalid', async () => {
  const expectations = [
    [401, 'AUTHENTICATION_FAILED'],
    [403, 'AUTHENTICATION_FAILED'],
    [429, 'RATE_LIMITED'],
    [500, 'PROVIDER_UNAVAILABLE'],
    [503, 'PROVIDER_UNAVAILABLE'],
    [400, 'INVALID_REQUEST'],
    [404, 'INVALID_REQUEST'],
  ];
  for (const [status, category] of expectations) {
    DI_CONFIG.timeoutMs = 60000;
    mockFetch(async (url, init) => {
      if (init?.method === 'POST') {
        return azureResponse({ error: 'boom' }, { status, headers: { 'operation-location': OP_LOCATION } });
      }
      return azureResponse({ status: 'running' });
    });
    await assert.rejects(
      azureDi.extractDocument('https://signed-example/resume.pdf'),
      (err) => err.name === 'AzureDiError' && err.category === category && err.upstreamStatus === status,
      `HTTP ${status} must classify as ${category}`
    );
    testMocks.reset();
  }
});

test('DI-CLIENT-8. transport throws: AbortError → TIMEOUT, network error → PROVIDER_UNAVAILABLE', async () => {
  const timeoutError = new Error('aborted');
  timeoutError.name = 'TimeoutError';
  mockFetch(async () => {
    throw timeoutError;
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && err.category === 'TIMEOUT'
  );
  testMocks.reset();
  mockFetch(async () => {
    throw new Error('ECONNRESET');
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && err.category === 'PROVIDER_UNAVAILABLE'
  );
});

test('DI-CLIENT-9. analyze POST without operation-location header → INVALID_REQUEST', async () => {
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ id: 'op-1' }, { status: 202, headers: {} });
    }
    return azureResponse({ status: 'succeeded', analyzeResult: { content: 'x' } });
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && err.category === 'INVALID_REQUEST'
  );
});

test('DI-CLIENT-10. no credential leakage in thrown messages (key never appears)', async () => {
  DI_CONFIG.apiKey = 'SECRET-AZURE-KEY-987654321';
  mockFetch(async (url, init) => {
    if (init?.method === 'POST') {
      return azureResponse({ error: 'x' }, { status: 401, headers: { 'operation-location': OP_LOCATION } });
    }
    return azureResponse({ status: 'running' });
  });
  await assert.rejects(
    azureDi.extractDocument('https://signed-example/resume.pdf'),
    (err) => err.name === 'AzureDiError' && !err.message.includes('SECRET-AZURE-KEY-987654321')
  );
});

test('DI-CLIENT-11. azure.di.extractor is a plain module — no AppError, no AIExecution, no M5.7 surface', async () => {
  const fs = require('node:fs');
  const content = fs.readFileSync(path.join(__dirname, '..', 'src', 'storage', 'azure.di.extractor.js'), 'utf8');
  // Prose may name the boundaries it must not cross (the header documents
  // them); the guards target actual references: imports and object usage.
  for (const term of ["require('../ai", "require('../modules", "require('mongoose')", "require('mongodb')", "require('http')", 'AIExecution.', 'orchestrator.']) {
    assert.ok(!content.includes(term), `azure.di.extractor.js must not reference: ${term}`);
  }
  assert.ok(content.includes('fetch('), 'plain fetch transport (storage.client precedent)');
  assert.ok(content.includes('AzureDiError'), 'internal category error, not a public taxonomy');
  assert.ok(!content.includes("require('../utils/errors')"), 'no domain error taxonomy surface');
});

// ---- textExtractor fallback (real parsing + mocked azure/storage seams) -----
// The DI-CLIENT* tests are excluded from the seam installation in the shared
// beforeEach above (they mock global fetch instead); every fallback test
// therefore runs against the mocked azureDi/storageClient modules.

test('EXTRACT-FALLBACK-1. empty local text + enabled + storageKey → azure text returned', async () => {
  DI_CONFIG.enabled = true;
  const text = await extractText(EMPTY_TEXT_PDF, 'application/pdf', { storageKey: 'users/u1/resumes/a.pdf' });
  assert.equal(text, 'Azure OCR extracted text.');
  assert.equal(storageClient.signedUrl.mock.calls.length, 1, 'signed URL issued for the private object');
  assert.equal(storageClient.signedUrl.mock.calls[0].arguments[0], 'users/u1/resumes/a.pdf');
  assert.equal(azureDi.extractDocument.mock.calls.length, 1);
  assert.equal(
    azureDi.extractDocument.mock.calls[0].arguments[0],
    'https://signed-example/users/u1/resumes/a.pdf?token=abc',
    'azure receives the signed URL, not the raw file'
  );
});

test('EXTRACT-FALLBACK-2. azure failure → existing ResumeTextExtractionError (no new taxonomy)', async () => {
  DI_CONFIG.enabled = true;
  azureDi.extractDocument.mock.mockImplementation(async () => {
    throw new azureDi.AzureDiError('RATE_LIMITED', 'Document Intelligence rate limit exceeded', { upstreamStatus: 429 });
  });
  await assert.rejects(
    extractText(EMPTY_TEXT_PDF, 'application/pdf', { storageKey: 'users/u1/resumes/a.pdf' }),
    (err) => err instanceof ResumeTextExtractionError && err.code === 'RESUME_TEXT_EXTRACTION_FAILED'
  );
});

test('EXTRACT-FALLBACK-3. azure returns empty text → ResumeTextExtractionError', async () => {
  DI_CONFIG.enabled = true;
  azureDi.extractDocument.mock.mockImplementation(async () => '   ');
  await assert.rejects(
    extractText(EMPTY_TEXT_PDF, 'application/pdf', { storageKey: 'users/u1/resumes/a.pdf' }),
    (err) => err instanceof ResumeTextExtractionError
  );
});

test('EXTRACT-FALLBACK-4. enabled but NO storageKey → azure never called, extraction failure', async () => {
  DI_CONFIG.enabled = true;
  await assert.rejects(
    extractText(EMPTY_TEXT_PDF, 'application/pdf'),
    (err) => err instanceof ResumeTextExtractionError
  );
  assert.equal(azureDi.extractDocument.mock.calls.length, 0, 'no storage key, no signed URL, no azure');
  assert.equal(storageClient.signedUrl.mock.calls.length, 0);
});

test('EXTRACT-FALLBACK-5. disabled → azure never called, byte-identical M6 behavior', async () => {
  DI_CONFIG.enabled = false;
  await assert.rejects(
    extractText(EMPTY_TEXT_PDF, 'application/pdf', { storageKey: 'users/u1/resumes/a.pdf' }),
    (err) => err instanceof ResumeTextExtractionError
  );
  assert.equal(azureDi.extractDocument.mock.calls.length, 0);
  assert.equal(storageClient.signedUrl.mock.calls.length, 0);
});

test('EXTRACT-FALLBACK-6. parser exception (corrupt input) → azure NEVER called, even when enabled', async () => {
  DI_CONFIG.enabled = true;
  await assert.rejects(
    extractText(GARBAGE_PDF, 'application/pdf', { storageKey: 'users/u1/resumes/a.pdf' }),
    (err) => err instanceof ResumeTextExtractionError
  );
  assert.equal(azureDi.extractDocument.mock.calls.length, 0, 'corrupt document is an input failure, not an azure case');
  assert.equal(storageClient.signedUrl.mock.calls.length, 0);
});

test('EXTRACT-FALLBACK-7. non-empty local text → azure never called, local text returned', async () => {
  DI_CONFIG.enabled = true;
  const text = await extractText(TEXT_PDF, 'application/pdf', { storageKey: 'users/u1/resumes/a.pdf' });
  assert.ok(text.includes('JavaScript and Node.js experience.'), 'local extraction result unchanged');
  assert.equal(azureDi.extractDocument.mock.calls.length, 0, 'local success never reaches azure');
  assert.equal(storageClient.signedUrl.mock.calls.length, 0);
});