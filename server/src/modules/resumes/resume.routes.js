// Resumes module routes (docs/02 §3, M4.2 + M6 P2-P4). All routes are
// protected and ownership-enforced at the service layer. POST /resumes is the
// M6 upload+analysis creation path (multipart 'file' field, validated by the
// upload middleware before any storage or AI call — docs/06 §3); the sync
// contract means the response status is ANALYZED or FAILED, never PROCESSING
// (docs/02 §2.3). GET /:id/download returns a signed short-lived URL (docs/06
// §3.3). Identity always comes from the JWT (req.user.id, set by requireAuth).
const express = require('express');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const uploadFile = require('../../middleware/upload');
const resumeController = require('./resume.controller');
const { idParamSchema } = require('./resume.validation');

const router = express.Router();

router.post('/', requireAuth, uploadFile, resumeController.createResume);
router.get('/', requireAuth, resumeController.listResumes);
router.get('/:id', requireAuth, validate(idParamSchema, 'params'), resumeController.getResume);
router.get('/:id/download', requireAuth, validate(idParamSchema, 'params'), resumeController.downloadResume);
router.delete('/:id', requireAuth, validate(idParamSchema, 'params'), resumeController.deleteResume);

module.exports = router;
