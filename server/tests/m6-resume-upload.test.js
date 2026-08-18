// M6 P2–P4 tests (docs/17 §7 P2-P4): upload middleware, POST /resumes sync
// analysis flow, signed-URL download, delete-with-object-cleanup. No network
// and no live storage — the storage client and the AI analysis are mocked at
// their module seams (same philosophy as the m5.1 provider mock); the text
// extraction runs for real against hand-built minimal PDF/DOCX fixtures so
// the pdf-parse/mammoth integration (the approved D1 deps) is exercised.
//
// Env note: the storage config and the AI config fail fast at require time
// (D5-a / ai.js:64-73) — all startup vars are set in this header before any
// module require, mirroring the m5.1/m5.7 headers.
process.env.MONGO_URI = 'mongodb://test:27017/prepverse-test';
process.env.PORT = '5001';
process.env.CLIENT_ORIGIN = 'http://localhost:5173';
process.env.JWT_ACCESS_SECRET = 'test-jwt-secret';
process.env.GEMINI_API_KEY = 'test-gemini-api-key-12345';
process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_KEY = 'test-supabase-service-key-12345';
process.env.SUPABASE_BUCKET = 'resumes';

const { test, before, after, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const mongoose = require('mongoose');

const app = require('../src/app');
const Resume = require('../src/modules/resumes/resume.model');
const storageClient = require('../src/storage/storage.client');
const { extractText } = require('../src/storage/textExtractor');
const resumeAnalyzer = require('../src/ai/resumeAnalyzer');
const userService = require('../src/modules/users/user.service');
const { signAccessToken } = require('../src/utils/jwt');
const {
  StorageClientError,
  AIProviderError,
  ResumeTextExtractionError,
} = require('../src/utils/errors');

let mongoServer;
let httpServer;
let baseUrl;

// Module seams (installed in before; Node 26 keeps the mock context on the
// returned function's .mock: ret.mock.calls / ret.mock.mockImplementation).
let seamUpload;
let seamDelete;
let seamSign;
let seamAnalyze;
let seamProfile;

const VALID_ANALYSIS = {
  extractedSkills: ['javascript', 'nodejs'],
  experienceSummary: 'Entry-level full-stack developer.',
  projects: [{ name: 'PrepVerse', description: 'Mock interview platform', technologies: ['nodejs', 'mongodb'] }],
  strengths: ['clean code', 'API design'],
  skillGaps: ['kubernetes', 'graphql'],
  promptVersion: 'resume-analysis-v1',
  model: 'gemini-3.6-flash',
};

// ---- Hand-built fixtures (no external generators) --------------------------

// Minimal single-page PDF with one text-showing operator; xref offsets are
// computed exactly so any strict parser can read it.
function buildMinimalPdf(text) {
  const stream = `BT /F1 12 Tf 72 720 Td (${text}) Tj ET\n`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}endstream`,
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

// ZIP (Store method, no compression) builder for the minimal DOCX fixture.
function crc32(buf) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
  }
  let crc = -1;
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ -1) >>> 0;
}

function zipStore(files) {
  const chunks = [];
  const central = [];
  let offset = 0;
  const now = new Date();
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();

  for (const { name, data } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(data);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(dosTime, 10);
    header.writeUInt16LE(dosDate, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(nameBuf.length, 26);
    header.writeUInt16LE(0, 28);
    chunks.push(header, nameBuf, data);
    central.push({ nameBuf, crc, size: data.length, offset });
    offset += 30 + nameBuf.length + data.length;
  }

  const cdStart = offset;
  for (const entry of central) {
    const rec = Buffer.alloc(46);
    rec.writeUInt32LE(0x02014b50, 0);
    rec.writeUInt16LE(20, 4);
    rec.writeUInt16LE(20, 6);
    rec.writeUInt16LE(0, 8);
    rec.writeUInt16LE(0, 10);
    rec.writeUInt16LE(dosTime, 12);
    rec.writeUInt16LE(dosDate, 14);
    rec.writeUInt32LE(entry.crc, 16);
    rec.writeUInt32LE(entry.size, 20);
    rec.writeUInt32LE(entry.size, 24);
    rec.writeUInt16LE(entry.nameBuf.length, 28);
    rec.writeUInt32LE(entry.offset, 42);
    chunks.push(rec, entry.nameBuf);
  }
  const cdSize = central.reduce((sum, e) => sum + 46 + e.nameBuf.length, 0);

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdStart, 16);
  chunks.push(eocd);
  return Buffer.concat(chunks);
}

function buildMinimalDocx(text) {
  const contentTypes = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>',
    'utf8'
  );
  const rels = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>',
    'utf8'
  );
  const document = Buffer.from(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
      '<w:body><w:p><w:r><w:t>' + text + '</w:t></w:r></w:p></w:body></w:document>',
    'utf8'
  );
  return zipStore([
    { name: '[Content_Types].xml', data: contentTypes },
    { name: '_rels/.rels', data: rels },
    { name: 'word/document.xml', data: document },
  ]);
}

const PDF_FIXTURE = buildMinimalPdf('JavaScript and Node.js experience.');
const DOCX_FIXTURE = buildMinimalDocx('React and Node.js developer.');
const GARBAGE_PDF = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(512, 0x41)]);

// ---- DB + HTTP lifecycle ----------------------------------------------------

test.before(async () => {
  mongoServer = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(mongoServer.getUri());
  // Install the module seams ONCE; beforeEach resets their implementations.
  seamUpload = mock.method(storageClient, 'uploadObject', async () => 'stored');
  seamDelete = mock.method(storageClient, 'deleteObject', async () => {});
  seamSign = mock.method(storageClient, 'signedUrl', async () => 'https://test.supabase.co/storage/v1/object/sign/resumes/users/x/a.pdf?token=abc');
  seamAnalyze = mock.method(resumeAnalyzer, 'analyzeResume', async () => VALID_ANALYSIS);
  seamProfile = mock.method(userService, 'getProfile', async () => ({ targetRole: 'Backend Developer', experienceLevel: 'Entry' }));
  httpServer = app.listen(0);
  await new Promise((resolve) => httpServer.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}/api/v1`;
});

test.after(async () => {
  mock.restoreAll();
  await httpServer.close();
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(() => {
  // Clear call history (mock.calls accumulates across tests), then re-apply
  // the benign default implementations.
  mock.reset();
  seamUpload = mock.method(storageClient, 'uploadObject', async () => 'stored');
  seamDelete = mock.method(storageClient, 'deleteObject', async () => {});
  seamSign = mock.method(storageClient, 'signedUrl', async () => 'https://test.supabase.co/storage/v1/object/sign/resumes/users/x/a.pdf?token=abc');
  seamAnalyze = mock.method(resumeAnalyzer, 'analyzeResume', async () => VALID_ANALYSIS);
  seamProfile = mock.method(userService, 'getProfile', async () => ({ targetRole: 'Backend Developer', experienceLevel: 'Entry' }));
});

async function seedResume(overrides = {}) {
  const resume = await Resume.create({
    userId: new mongoose.Types.ObjectId(),
    storageKey: 'users/u1/resumes/11111111-2222-3333-4444-555555555555.pdf',
    originalFilename: 'my resume.pdf',
    mimeType: 'application/pdf',
    size: 1234,
    status: 'ANALYZED',
    ...overrides,
  });
  return resume;
}

function tokenFor(userId) {
  return signAccessToken({ _id: userId });
}

function uploadForm(buffer, filename, type) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type }), filename);
  return form;
}

async function postResume(userId, form) {
  return fetch(`${baseUrl}/resumes`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
    body: form,
  });
}

// ---- P2: upload middleware + POST /resumes -----------------------------------

test('M6-P2-1. POST /resumes with a real PDF → 201 ANALYZED with validated analysis', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, uploadForm(PDF_FIXTURE, 'resume.pdf', 'application/pdf'));
  assert.equal(res.status, 201);
  const body = await res.json();

  assert.equal(body.status, 'ANALYZED');
  assert.equal(body.failureReason, null);
  assert.equal(body.originalFilename, 'resume.pdf');
  assert.equal(body.mimeType, 'application/pdf');
  assert.equal(body.size, PDF_FIXTURE.length);
  assert.equal(body.analysis.promptVersion, 'resume-analysis-v1');
  assert.deepEqual(body.analysis.extractedSkills, ['javascript', 'nodejs']);

  // The real extractor ran: the prompt input must contain the PDF's text.
  const analyzeCalls = seamAnalyze.mock.calls;
  assert.equal(analyzeCalls.length, 1);
  const params = analyzeCalls[0].arguments[0];
  assert.ok(params.resumeText.includes('JavaScript and Node.js experience.'));
  assert.equal(params.targetRole, 'Backend Developer');
  assert.equal(params.entityId, body._id, 'AIExecution traces to the created resume');

  // Object storage saw exactly one upload with a namespaced random key.
  const uploadCalls = seamUpload.mock.calls;
  assert.equal(uploadCalls.length, 1);
  assert.match(uploadCalls[0].arguments[0], /^users\/[a-f0-9]{24}\/resumes\/[0-9a-f-]{36}\.pdf$/);

  // The doc is persisted and the detail view agrees with the create response.
  const saved = await Resume.findOne({ _id: body._id, userId });
  assert.equal(saved.status, 'ANALYZED');
  assert.equal(saved.storageKey, uploadCalls[0].arguments[0]);
  const get = await fetch(`${baseUrl}/resumes/${body._id}`, {
    headers: { Authorization: `Bearer ${tokenFor(userId)}` },
  });
  assert.deepEqual(await get.json(), body, 'create response == GET detail');
});

test('M6-P2-2. POST /resumes with a real DOCX → 201 ANALYZED, canonical docx MIME', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, uploadForm(DOCX_FIXTURE, 'cv.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.status, 'ANALYZED');
  assert.equal(body.mimeType, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  const params = seamAnalyze.mock.calls[0].arguments[0];
  assert.ok(params.resumeText.includes('React and Node.js developer.'));
});

test('M6-P2-3. POST /resumes with a disallowed MIME → 400, no storage call', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, uploadForm(PDF_FIXTURE, 'resume.txt', 'text/plain'));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(seamUpload.mock.calls.length, 0, 'nothing reaches storage');
  assert.equal(seamAnalyze.mock.calls.length, 0, 'nothing reaches AI');
});

test('M6-P2-4. content does not match declared type → 400 (magic-byte sniff)', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, uploadForm(DOCX_FIXTURE, 'fake.pdf', 'application/pdf'));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
  assert.equal(seamUpload.mock.calls.length, 0);
});

test('M6-P2-5. extension does not match sniffed type → 400', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, uploadForm(PDF_FIXTURE, 'resume.docx', 'application/pdf'));
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
});

test('M6-P2-5b. file above 5MB → 400 FILE_TOO_LARGE, nothing uploaded', async () => {
  const userId = new mongoose.Types.ObjectId();
  const big = buildMinimalPdf('x'.repeat(5 * 1024 * 1024)); // ~5MB+ of stream text
  const res = await postResume(userId, uploadForm(big, 'big.pdf', 'application/pdf'));
  assert.equal(res.status, 400);
  const body = await res.json();
  assert.equal(body.error.details.code, 'FILE_TOO_LARGE');
  assert.equal(seamUpload.mock.calls.length, 0);
});

test('M6-P2-5c. missing file field → 400', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, new FormData());
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error.code, 'VALIDATION_ERROR');
});

test('M6-P2-6. storage upload failure → 502 OBJECT_STORAGE_FAILED, no doc persisted', async () => {
  const userId = new mongoose.Types.ObjectId();
  seamUpload.mock.mockImplementation(async () => {
    throw new StorageClientError('boom', { category: 'STORAGE_UNAVAILABLE', upstreamStatus: 500 });
  });
  const res = await postResume(userId, uploadForm(PDF_FIXTURE, 'resume.pdf', 'application/pdf'));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'OBJECT_STORAGE_FAILED');
  assert.equal(await Resume.countDocuments({ userId }), 0, 'no orphan doc');
});

test('M6-P2-7. Mongo insert failure after upload → orphan object cleaned up, error rethrown', async () => {
  const userId = new mongoose.Types.ObjectId();
  const originalCreate = Resume.create;
  Resume.create = async () => {
    throw new Error('replica set lost');
  };
  try {
    const res = await postResume(userId, uploadForm(PDF_FIXTURE, 'resume.pdf', 'application/pdf'));
    assert.equal(res.status, 500);
    assert.equal((await res.json()).error.code, 'INTERNAL_ERROR');
    assert.equal(seamDelete.mock.calls.length, 1, 'orphan object removed');
    assert.match(
      seamDelete.mock.calls[0].arguments[0],
      /^users\/[a-f0-9]{24}\/resumes\/[0-9a-f-]{36}\.pdf$/,
      'cleanup targets the service-generated storage key'
    );
  } finally {
    Resume.create = originalCreate;
  }
});

test('M6-P2-8. analysis failure → 201 FAILED with errorCode, object + doc retained (D4)', async () => {
  const userId = new mongoose.Types.ObjectId();
  seamAnalyze.mock.mockImplementation(async () => {
    throw new AIProviderError('exhausted', { retryable: false, failure: 'AI_PROVIDER_FAILED' });
  });
  const res = await postResume(userId, uploadForm(PDF_FIXTURE, 'resume.pdf', 'application/pdf'));
  assert.equal(res.status, 201, 'FAILED is a legitimate terminal resource');
  const body = await res.json();
  assert.equal(body.status, 'FAILED');
  assert.equal(body.failureReason, 'AI_PROVIDER_FAILED');
  assert.equal(body.analysis, null);
  assert.equal(seamDelete.mock.calls.length, 0, 'object stays for re-analysis (docs/05 §3 note)');
  const saved = await Resume.findOne({ _id: body._id, userId });
  assert.equal(saved.status, 'FAILED');
  assert.ok(saved.storageKey, 'storageKey retained so delete/re-upload works');
});

test('M6-P2-8b. unreadable file content → FAILED RESUME_TEXT_EXTRACTION_FAILED', async () => {
  const userId = new mongoose.Types.ObjectId();
  const res = await postResume(userId, uploadForm(GARBAGE_PDF, 'bad.pdf', 'application/pdf'));
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.status, 'FAILED');
  assert.equal(body.failureReason, 'RESUME_TEXT_EXTRACTION_FAILED');
  assert.equal(seamAnalyze.mock.calls.length, 0, 'no AI call on unreadable text');
});

// ---- P2: textExtractor unit behavior -----------------------------------------

test('M6-P2-9. textExtractor: real PDF → plain text', async () => {
  const text = await extractText(PDF_FIXTURE, 'application/pdf');
  assert.ok(text.includes('JavaScript and Node.js experience.'));
});

test('M6-P2-9b. textExtractor: real DOCX → plain text', async () => {
  const text = await extractText(DOCX_FIXTURE, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  assert.ok(text.includes('React and Node.js developer.'));
});

test('M6-P2-9c. textExtractor: garbage → ResumeTextExtractionError (never empty strings)', async () => {
  await assert.rejects(extractText(GARBAGE_PDF, 'application/pdf'), (err) => err instanceof ResumeTextExtractionError);
  await assert.rejects(extractText(Buffer.alloc(0), 'application/pdf'), (err) => err instanceof ResumeTextExtractionError);
  await assert.rejects(extractText(Buffer.from('plain text, not a pdf'), 'application/pdf'), (err) => err instanceof ResumeTextExtractionError);
});

// ---- P3: signed-URL download --------------------------------------------------

test('M6-P3-1. GET /:id/download → 200 { url, filename, expiresInSeconds: 900 }', async () => {
  const userA = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA, originalFilename: 'my resume.pdf' });
  seamSign.mock.mockImplementation(async (key) => `https://test.supabase.co/storage/v1/object/sign/resumes/${key}?token=abc`);
  const res = await fetch(`${baseUrl}/resumes/${resume._id}/download`, {
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.url, `https://test.supabase.co/storage/v1/object/sign/resumes/${resume.storageKey}?token=abc`);
  assert.equal(body.filename, 'my resume.pdf');
  assert.equal(body.expiresInSeconds, 900, 'D2: 15-minute TTL');
  assert.equal(seamSign.mock.calls[0].arguments[0], resume.storageKey);
});

test('M6-P3-2. download: not yours → 404, no signed URL requested', async () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA });
  const res = await fetch(`${baseUrl}/resumes/${resume._id}/download`, {
    headers: { Authorization: `Bearer ${tokenFor(userB)}` },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
  assert.equal(seamSign.mock.calls.length, 0);
});

test('M6-P3-3. download: doc exists but object missing → 404, honest dangling-key failure', async () => {
  const userA = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA });
  seamSign.mock.mockImplementation(async () => {
    throw new StorageClientError('object gone', { category: 'NOT_FOUND', upstreamStatus: 404 });
  });
  const res = await fetch(`${baseUrl}/resumes/${resume._id}/download`, {
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  assert.equal(res.status, 404);
  assert.equal((await res.json()).error.code, 'NOT_FOUND');
});

test('M6-P3-4. download: storage outage → 502 OBJECT_STORAGE_FAILED', async () => {
  const userA = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA });
  seamSign.mock.mockImplementation(async () => {
    throw new StorageClientError('down', { category: 'STORAGE_UNAVAILABLE', upstreamStatus: 502 });
  });
  const res = await fetch(`${baseUrl}/resumes/${resume._id}/download`, {
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error.code, 'OBJECT_STORAGE_FAILED');
});

// ---- P4: delete with object cleanup -------------------------------------------

test('M6-P4-1. DELETE removes the doc AND the object (best-effort)', async () => {
  const userA = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA, storageKey: 'users/u1/resumes/k.pdf' });
  const res = await fetch(`${baseUrl}/resumes/${resume._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  assert.equal(res.status, 204);
  assert.equal(await Resume.countDocuments({ _id: resume._id }), 0, 'doc deleted');
  assert.equal(seamDelete.mock.calls.length, 1);
  assert.equal(seamDelete.mock.calls[0].arguments[0], 'users/u1/resumes/k.pdf');
});

test('M6-P4-2. DELETE: object cleanup failure still returns 204 (orphan bounded)', async () => {
  const userA = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA });
  seamDelete.mock.mockImplementation(async () => {
    throw new StorageClientError('down', { category: 'STORAGE_UNAVAILABLE' });
  });
  const res = await fetch(`${baseUrl}/resumes/${resume._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  assert.equal(res.status, 204);
  assert.equal(await Resume.countDocuments({ _id: resume._id }), 0, 'doc still deleted');
});

test('M6-P4-3. DELETE: not yours → 404, no object cleanup', async () => {
  const userA = new mongoose.Types.ObjectId();
  const userB = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA });
  const res = await fetch(`${baseUrl}/resumes/${resume._id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${tokenFor(userB)}` },
  });
  assert.equal(res.status, 404);
  assert.equal(seamDelete.mock.calls.length, 0);
  assert.equal(await Resume.countDocuments({ _id: resume._id }), 1, 'doc untouched');
});

// ---- list/detail shape unchanged ---------------------------------------------

test('M6-P2-10. list stays lightweight (no analysis, no storageKey); detail carries analysis', async () => {
  const userA = new mongoose.Types.ObjectId();
  const resume = await seedResume({ userId: userA, analysis: VALID_ANALYSIS, status: 'ANALYZED' });
  await seedResume({ userId: userA, status: 'FAILED', failureReason: 'AI_PROVIDER_FAILED' });

  const listRes = await fetch(`${baseUrl}/resumes`, { headers: { Authorization: `Bearer ${tokenFor(userA)}` } });
  assert.equal(listRes.status, 200);
  const list = await listRes.json();
  assert.equal(list.length, 2);
  for (const item of list) {
    assert.deepEqual(Object.keys(item).sort(), ['_id', 'createdAt', 'originalFilename', 'status']);
  }

  const detailRes = await fetch(`${baseUrl}/resumes/${resume._id}`, {
    headers: { Authorization: `Bearer ${tokenFor(userA)}` },
  });
  const detail = await detailRes.json();
  assert.equal(detail.status, 'ANALYZED');
  assert.deepEqual(detail.analysis.extractedSkills, ['javascript', 'nodejs']);
  assert.ok(detail.storageKey, 'detail keeps storageKey for internal use');
});
