// ResumeService — business/application layer for the resumes module.
// M4.2: GET /resumes, GET /resumes/:id, DELETE /resumes/:id.
//
// Owned model (docs/05 §3): Resume — the only model this service may touch.
// Ownership (docs/06 §2): every by-id lookup is findOne({ _id, userId }),
// never findById + a separate check. "Not found" and "not yours" are the same
// 404 from the outside — no 403, no existence leak.
const Resume = require('./resume.model');
const { NotFoundError } = require('../../utils/errors');

async function listResumes(userId) {
  const resumes = await Resume.find({ userId }).sort({ createdAt: -1 });
  // List view is a lightweight summary — analysis stays on the detail view
  // (docs/02 §3). The { userId, createdAt: -1 } index serves this sort.
  return resumes.map((resume) => ({
    _id: resume._id,
    status: resume.status,
    originalFilename: resume.originalFilename,
    createdAt: resume.createdAt,
  }));
}

async function getResume(userId, id) {
  const resume = await Resume.findOne({ _id: id, userId });
  if (!resume) {
    throw new NotFoundError('Resume not found');
  }
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

async function deleteResume(userId, id) {
  const deleted = await Resume.findOneAndDelete({ _id: id, userId });
  if (!deleted) {
    throw new NotFoundError('Resume not found');
  }
  // Storage cleanup is out of scope (docs/02 §3; M4.2 guardrail 5) — there
  // is no object-storage integration yet. This deletes the MongoDB document
  // only.
}

module.exports = { listResumes, getResume, deleteResume };
