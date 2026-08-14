// AuthController — HTTP adapter for the auth module (M3 §17). Reads validated
// input (req.validatedBody) and req.user, calls the service, maps results to
// HTTP responses, forwards errors to next(). No mongoose/bcrypt/jwt here, no
// business logic.
const authService = require('./auth.service');

async function register(req, res, next) {
  try {
    const result = await authService.register(req.validatedBody);
    res.status(201).json(result);
  } catch (error) {
    next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.validatedBody);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

async function me(req, res, next) {
  try {
    const result = await authService.me(req.user.id);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

function logout(req, res, next) {
  try {
    res.status(200).json(authService.logout());
  } catch (error) {
    next(error);
  }
}

module.exports = { register, login, me, logout };
