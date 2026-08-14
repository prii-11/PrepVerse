// Resumes module routes (docs/02 §3, M4.2). All routes are protected and
// ownership-enforced at the service layer. Deliberately NO POST /resumes —
// the only documented creation path requires object storage + AI analysis in
// the same call (docs/02 §3), both out of scope until M6.
// Identity always comes from the JWT (req.user.id, set by requireAuth).
const express = require('express');
const validate = require('../../middleware/validate');
const { requireAuth } = require('../../middleware/auth');
const resumeController = require('./resume.controller');
const { idParamSchema } = require('./resume.validation');

const router = express.Router();

router.get('/', requireAuth, resumeController.listResumes);
router.get('/:id', requireAuth, validate(idParamSchema, 'params'), resumeController.getResume);
router.delete('/:id', requireAuth, validate(idParamSchema, 'params'), resumeController.deleteResume);

module.exports = router;
