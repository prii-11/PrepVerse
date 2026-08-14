// ResumeService — business/application layer for the resumes module.
// Structural seam only (M2.4): no business behavior is implemented yet.
// Resume upload/analysis flows will be added by their owning milestone (M5).
//
// Owned model (docs/05 §3): Resume — the only model this service may touch.
// The import below is intentional: it pins the service -> model ownership edge.
const Resume = require('./resume.model');

module.exports = {};
