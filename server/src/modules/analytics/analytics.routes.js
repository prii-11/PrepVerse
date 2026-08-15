// Analytics module routes (docs/02 §3, M4.4). All three endpoints are
// read-only and protected; identity always comes from the JWT (req.user.id, set
// by requireAuth). No request bodies/params to validate, so no validation
// middleware is needed. Deliberately no POST/PATCH/DELETE analytics endpoints.
const express = require('express');
const { requireAuth } = require('../../middleware/auth');
const analyticsController = require('./analytics.controller');

const router = express.Router();

router.get('/readiness', requireAuth, analyticsController.getReadiness);
router.get('/progress', requireAuth, analyticsController.getProgress);
router.get('/practice-plan', requireAuth, analyticsController.getPracticePlan);

module.exports = router;
