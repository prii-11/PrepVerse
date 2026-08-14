// InterviewService — business/application layer for the interviews module.
// Structural seam only (M2.4): no business behavior is implemented yet.
// Interview lifecycle / evaluation flows will be added by their owning
// milestones (M4/M5).
//
// Owned model (docs/05 §4): Interview — the only model this service may touch.
// The import below is intentional: it pins the service -> model ownership edge.
const Interview = require('./interview.model');

module.exports = {};
