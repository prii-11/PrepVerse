// UserService — business/application layer for the users module.
// Structural seam only (M2.4): no business behavior is implemented yet.
// Feature methods will be added here by their owning milestones (M3 auth,
// M4 profile/skill-profile flows).
//
// Owned model (docs/05 §2): User — the only model this service may touch.
// The import below is intentional: it pins the service -> model ownership edge
// so future feature work lands in the service, never in a controller.
const User = require('./user.model');

module.exports = {};
