// InterviewController — HTTP layer for the interviews module. Thin by design:
// reads req.user (set by auth middleware), req.validatedParams and
// req.validatedBody (set by the validate middleware), calls the service, maps
// results to HTTP responses, forwards errors to next(). No business logic, no
// state transitions, no model access, no AI behavior.
const interviewService = require('./interview.service');

async function createInterview(req, res, next) {
  try {
    res.status(201).json(await interviewService.createInterview(req.user.id, req.validatedBody));
  } catch (err) {
    next(err);
  }
}

async function listInterviews(req, res, next) {
  try {
    res.status(200).json(await interviewService.listInterviews(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function getInterview(req, res, next) {
  try {
    res.status(200).json(await interviewService.getInterview(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

async function startInterview(req, res, next) {
  try {
    res.status(200).json(await interviewService.startInterview(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

async function addAnswer(req, res, next) {
  try {
    res.status(201).json(await interviewService.addAnswer(req.user.id, req.validatedParams.id, req.validatedBody));
  } catch (err) {
    next(err);
  }
}

async function submitInterview(req, res, next) {
  try {
    res.status(200).json(await interviewService.submitInterview(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

async function cancelInterview(req, res, next) {
  try {
    res.status(200).json(await interviewService.cancelInterview(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

async function getReport(req, res, next) {
  try {
    res.status(200).json(await interviewService.getReport(req.user.id, req.validatedParams.id));
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createInterview,
  listInterviews,
  getInterview,
  startInterview,
  addAnswer,
  submitInterview,
  cancelInterview,
  getReport,
};
