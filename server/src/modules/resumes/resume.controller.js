// ResumeController — HTTP layer for the resumes module. Thin by design:
// reads req.user (set by auth middleware), req.validatedParams (set by the
// validate middleware) and req.file (set by the upload middleware), calls the
// service, maps results to HTTP responses, forwards errors to next(). No
// business logic, no model access.
const resumeService = require('./resume.service');

async function listResumes(req, res, next) {
  try {
    res.status(200).json(await resumeService.listResumes(req.user.id));
  } catch (err) {
    next(err);
  }
}

// M6 P2: synchronous upload+analysis (docs/02 §2.3). The upload middleware
// has already validated MIME/size/content/sanitized the filename; the
// service receives only canonical facts. Returns 201 with the full detail —
// status is ANALYZED or FAILED, never a faked PROCESSING.
async function createResume(req, res, next) {
  try {
    const resume = await resumeService.createResume(req.user.id, {
      buffer: req.file.buffer,
      originalFilename: req.file.originalFilename,
      mimeType: req.file.mimeType,
      size: req.file.size,
    });
    res.status(201).json(resume);
  } catch (err) {
    next(err);
  }
}

// M6 P3: signed short-lived download URL (docs/06 §3.3). Never a public
// link, never a stream — the client fetches the signed URL directly.
async function downloadResume(req, res, next) {
  try {
    res.status(200).json(await resumeService.getDownloadUrl(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

async function getResume(req, res, next) {
  try {
    res.status(200).json(await resumeService.getResume(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

async function deleteResume(req, res, next) {
  try {
    await resumeService.deleteResume(req.user.id, req.validatedParams.id);
    res.status(204).end();
  } catch (err) {
    next(err);
  }
}

module.exports = { listResumes, createResume, getResume, downloadResume, deleteResume };
