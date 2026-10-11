// ResumeService — business/application layer for the resumes module.
// M4.2: GET /resumes, GET /resumes/:id, DELETE /resumes/:id.
// M6 P2-P4 (docs/17 §7): POST /resumes (object-storage upload → doc →
// extraction → synchronous AI analysis), GET /resumes/:id/download (signed
// short-lived URL), DELETE now also removes the stored object.
//
// Owned model (docs/05 §3): Resume — the only model this service may touch.
// Read-only dependency: userService.getProfile (M4.1) supplies the catalog-
// backed targetRole/experienceLevel the analysis needs (docs/01 §1.3 flow:
// onboarding happens before resume upload). Object storage goes through the
// storage client only — never an SDK or fetch here (docs/17 §4.7).
//
// Ownership (docs/06 §2): every by-id lookup is findOne({ _id, userId }),
// never findById + a separate check. "Not found" and "not yours" are the same
// 404 from the outside — no 403, no existence leak.
const crypto = require('node:crypto');
const Resume = require('./resume.model');
const userService = require('../users/user.service');
// Object-property access (not destructuring) so the module seams stay
// mockable at the boundary — the repo pattern (m5.7 mocks
// geminiProvider.generate the same way).
const storageClient = require('../../storage/storage.client');
const textExtractor = require('../../storage/textExtractor');
const resumeAnalyzer = require('../../ai/resumeAnalyzer');
const { NotFoundError } = require('../../utils/errors');

// "Not found" and "not yours" collapse to the same 404 (docs/06 §2).
async function getOwnedResume(userId, id) {
  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new NotFoundError('Resume not found');
  }
  return resume;
}

function toDetail(resume) {
  return {
    _id: resume._id,
    storageKey: resume.storageKey,
    originalFilename: resume.originalFilename,
    mimeType: resume.mimeType,
    size: resume.size,
    status: resume.status,
    // Full analysis object — present once status is ANALYZED (docs/02 §3);
    // null otherwise.
    analysis: resume.analysis ?? null,
    failureReason: resume.failureReason ?? null,
    createdAt: resume.createdAt,
    updatedAt: resume.updatedAt,
  };
}

async function listResumes(userId) {
  const resumes = await Resume.find({ userId }).sort({ createdAt: -1 });
  // List view is a lightweight summary — analysis stays on the detail view
  // and the object storage key never leaves the server (docs/17 §4.5).
  // The { userId, createdAt: -1 } index serves this sort.
  return resumes.map((resume) => ({
    _id: resume._id,
    status: resume.status,
    originalFilename: resume.originalFilename,
    createdAt: resume.createdAt,
  }));
}

async function getResume(userId, id) {
  return toDetail(await getOwnedResume(userId, id));
}

// M6 P2 (docs/17 §7 P2, G3): synchronous upload → analysis (docs/02 §2.3).
// Sequence: validate+upload bytes → persist UPLOADED doc → extract text →
// AI analysis → ONE atomic findOneAndUpdate to ANALYZED or FAILED (the
// M5.3 precedent for closing crash windows). FAILED is a legitimate terminal
// resource (docs/02 §2.4 "Resume → FAILED"; docs/17 D4): the object STAYS in
// storage, the doc carries only an errorCode, and the user recovers by
// deleting + re-uploading.
async function createResume(userId, { buffer, originalFilename, mimeType, size }) {
  // Storage key: namespaced, unguessable, collision-free (a random UUID, not
  // the original filename — the filename lives in Mongo metadata only).
  const storageKey = `users/${userId}/resumes/${crypto.randomUUID()}.${mimeType === 'application/pdf' ? 'pdf' : 'docx'}`;

  // 1. Push bytes to the private bucket (single attempt — no retry loop in
  //    the client; a failed upload surfaces as OBJECT_STORAGE_FAILED).
  await storageClient.uploadObject(storageKey, buffer, mimeType);

  // 2. Persist the document. If Mongo insert fails after a successful upload
  //    we have an orphan object (G6): best-effort cleanup, then rethrow the
  //    original error — the resource was never created.
  let resume;
  try {
    resume = await Resume.create({
      userId,
      storageKey,
      originalFilename,
      mimeType,
      size,
      status: 'UPLOADED',
    });
  } catch (err) {
    try {
      await storageClient.deleteObject(storageKey);
    } catch (cleanupErr) {
      // Best-effort only; the orphan is bounded and invisible to the user.
    }
    throw err;
  }

  // 3. Extract plain text from the file (docs/06 §4.2 bounds AI input size).
  //    Extraction failure does not destroy the upload — FAILED + errorCode.
  //    M6.1 (docs/21): the storageKey rides along so the optional Azure DI
  //    fallback can signed-URL the private object when local extraction
  //    yields empty text (scanned PDFs). The key never leaves the server.
  let resumeText;
  try {
    resumeText = await textExtractor.extractText(buffer, mimeType, { storageKey });
  } catch (extractErr) {
    return finalizeFailed(resume, userId, 'RESUME_TEXT_EXTRACTION_FAILED');
  }

  // 4. Synchronous AI analysis. The profile's targetRole/experienceLevel
  //    come from onboarding (catalog-backed, users module), not from the
  //    request body — the frontend never supplies business facts here.
  const profile = await userService.getProfile(userId);
  try {
    const analysis = await resumeAnalyzer.analyzeResume({
      resumeText,
      targetRole: profile.targetRole,
      experienceLevel: profile.experienceLevel,
      userId,
      entityId: resume._id.toString(),
    });
    // 5. Atomic ANALYZED transition (one write — the M5.3 pattern).
    const updated = await Resume.findOneAndUpdate(
      { _id: resume._id, userId },
      { status: 'ANALYZED', analysis, updatedAt: new Date() },
      { new: true }
    );
    return toDetail(updated);
  } catch (err) {
    // 5b. AI retries exhausted → terminal FAILED, errorCode only (docs/02
    //     §2.4). The 502 is not propagated: the resume resource itself was
    //     created successfully and FAILED is its documented outcome.
    return finalizeFailed(resume, userId, err.code === 'VALIDATION_ERROR' ? 'SCHEMA_VALIDATION_FAILED' : 'AI_PROVIDER_FAILED');
  }
}

async function finalizeFailed(resume, userId, errorCode) {
  // analysis: null is stored explicitly — a never-set subdocument would
  // otherwise hydrate as empty arrays instead of the contract's null.
  const updated = await Resume.findOneAndUpdate(
    { _id: resume._id, userId },
    { status: 'FAILED', failureReason: errorCode, analysis: null, updatedAt: new Date() },
    { new: true }
  );
  return toDetail(updated);
}

// M6 P3 (docs/17 §7 P3, G4): signed short-lived URL (docs/06 §3.3) — never
// a public link, never a stream. The user re-requests this endpoint when the
// URL expires (15 min, JWT parity — docs/17 D2); nothing is stored server-side.
async function getDownloadUrl(userId, id) {
  const resume = await getOwnedResume(userId, id);
  try {
    const url = await storageClient.signedUrl(resume.storageKey);
    return {
      url,
      filename: resume.originalFilename,
      expiresInSeconds: storageClient.STORAGE_CONFIG.signedUrlTtlSeconds,
    };
  } catch (err) {
    if (err && err.details && err.details.category === 'NOT_FOUND') {
      // Doc exists but the object is gone (dangling storageKey — G6): honest
      // 404 for the file, distinct from the resource-level 404.
      throw new NotFoundError('Resume file not found');
    }
    throw err;
  }
}

// M6 P4 (docs/17 §7 P4, G5): delete = Mongo doc + object cleanup. Doc first
// (deleting the object first could leave a doc pointing at a missing file),
// then best-effort object removal — a failed cleanup leaves an orphan object
// but never a half-deleted resource; 204 either way (docs/02 §3).
async function deleteResume(userId, id) {
  const deleted = await Resume.findOneAndDelete({ _id: id, userId });
  if (!deleted) {
    throw new NotFoundError('Resume not found');
  }
  try {
    await storageClient.deleteObject(deleted.storageKey);
  } catch (err) {
    // Best-effort: the object stays orphaned, logged server-side only.
  }
}

module.exports = { listResumes, getResume, createResume, getDownloadUrl, deleteResume };