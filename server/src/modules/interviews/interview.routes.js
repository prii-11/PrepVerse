// Interviews module routes (docs/02 §3, M4.3). All routes are protected and
// ownership-enforced at the service layer. Deliberately NO POST /interviews
// (creation requires question generation — M5) and NO POST /interviews/:id/submit
// (requires the M5 evaluation pipeline). Identity always comes from the JWT
// (req.user.id, set by requireAuth).
const express = require('express');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const interviewController = require('./interview.controller');
const { idParamSchema, answerBodySchema } = require('./interview.validation');

const router = express.Router();

router.get('/', requireAuth, interviewController.listInterviews);
router.get('/:id', requireAuth, validate(idParamSchema, 'params'), interviewController.getInterview);
router.post('/:id/start', requireAuth, validate(idParamSchema, 'params'), interviewController.startInterview);
router.post('/:id/answers', requireAuth, validate(idParamSchema, 'params'), validate(answerBodySchema), interviewController.addAnswer);
router.post('/:id/cancel', requireAuth, validate(idParamSchema, 'params'), interviewController.cancelInterview);
router.get('/:id/report', requireAuth, validate(idParamSchema, 'params'), interviewController.getReport);

module.exports = router;
