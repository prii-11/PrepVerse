// Interviews module routes (docs/02 §3; M4.3 + M5.3 creation). All routes are
// protected and ownership-enforced at the service layer. POST /interviews is
// the M5.3 creation endpoint (catalog-backed targetRole, question generation
// through the orchestrator). Submission and the answer-evaluation pipeline
// remain out of scope until M5.4. Identity always comes from the JWT
// (req.user.id, set by requireAuth).
const express = require('express');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const interviewController = require('./interview.controller');
const { idParamSchema, answerBodySchema, createInterviewBodySchema } = require('./interview.validation');

const router = express.Router();

router.post('/', requireAuth, validate(createInterviewBodySchema), interviewController.createInterview);
router.get('/', requireAuth, interviewController.listInterviews);
router.get('/:id', requireAuth, validate(idParamSchema, 'params'), interviewController.getInterview);
router.post('/:id/start', requireAuth, validate(idParamSchema, 'params'), interviewController.startInterview);
router.post('/:id/answers', requireAuth, validate(idParamSchema, 'params'), validate(answerBodySchema), interviewController.addAnswer);
router.post('/:id/cancel', requireAuth, validate(idParamSchema, 'params'), interviewController.cancelInterview);
router.get('/:id/report', requireAuth, validate(idParamSchema, 'params'), interviewController.getReport);

module.exports = router;
