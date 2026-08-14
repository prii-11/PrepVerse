// UserController — HTTP layer for the users module. Thin by design:
// reads req.user (set by auth middleware) and req.validatedBody (set by the
// validate middleware), calls the service, maps results to HTTP responses,
// forwards errors to next(). No business logic, no model access.
const userService = require('./user.service');

async function getProfile(req, res, next) {
  try {
    res.status(200).json(await userService.getProfile(req.user.id));
  } catch (err) {
    next(err);
  }
}

async function updateProfile(req, res, next) {
  try {
    res.status(200).json(await userService.updateProfile(req.user.id, req.validatedBody));
  } catch (err) {
    next(err);
  }
}

async function getSkillProfile(req, res, next) {
  try {
    res.status(200).json(await userService.getSkillProfile(req.user.id));
  } catch (err) {
    next(err);
  }
}

module.exports = { getProfile, updateProfile, getSkillProfile };
