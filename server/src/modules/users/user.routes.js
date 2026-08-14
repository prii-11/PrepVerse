// Users module routes (docs/02 §3, M4.1). All /users/me/* routes are
// protected — identity always comes from the JWT (req.user.id, set by
// requireAuth), never from body/params/query.
const express = require('express');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const userController = require('./user.controller');
const { updateProfileSchema } = require('./user.validation');

const router = express.Router();

router.get('/me/profile', requireAuth, userController.getProfile);
router.patch('/me/profile', requireAuth, validate(updateProfileSchema), userController.updateProfile);
router.get('/me/skill-profile', requireAuth, userController.getSkillProfile);

module.exports = router;
