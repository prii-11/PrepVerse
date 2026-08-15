// AnalyticsController — HTTP layer for the analytics module (M4.4). Thin by
// design: reads req.user.id (set by requireAuth), calls the service, sends the
// response, forwards errors to next(). No Mongoose, no scoring math, no model
// access — all analytics logic lives in analytics.service.js.
const analyticsService = require('./analytics.service');

async function getReadiness(req, res, next) {
  try {
    res.status(200).json(await analyticsService.getReadiness(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function getProgress(req, res, next) {
  try {
    res.status(200).json(await analyticsService.getProgress(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function getPracticePlan(req, res, next) {
  try {
    res.status(200).json(await analyticsService.getPracticePlan(req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { getReadiness, getProgress, getPracticePlan };
