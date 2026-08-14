// Auth routes — mounted at /api/v1/auth (docs/02 §3). Register/login validate
// via the existing validate middleware; /me is protected by requireAuth.
// Layering: IP limiter (global) -> validation -> controller -> service -> model.
const express = require('express');
const validate = require('../../middleware/validate');
const authMiddleware = require('../../middleware/auth');
const authController = require('./auth.controller');
const { registerSchema, loginSchema } = require('./auth.validation');

const router = express.Router();

router.post('/register', validate(registerSchema), authController.register);
router.post('/login', validate(loginSchema), authController.login);
router.post('/logout', authController.logout);
router.get('/me', authMiddleware.requireAuth, authController.me);

module.exports = router;
