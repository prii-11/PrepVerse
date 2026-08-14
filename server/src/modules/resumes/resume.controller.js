// ResumeController — HTTP layer for the resumes module. Thin by design:
// reads req.user (set by auth middleware) and req.validatedParams (set by the
// validate middleware), calls the service, maps results to HTTP responses,
// forwards errors to next(). No business logic, no model access.
const resumeService = require('./resume.service');

async function listResumes(req, res, next) {
  try {
    res.status(200).json(await resumeService.listResumes(req.user.id));
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

module.exports = { listResumes, getResume, deleteResume };
