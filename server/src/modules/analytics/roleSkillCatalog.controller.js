// RoleSkillCatalogController — HTTP layer for the analytics module's catalog.
// Thin by design (M2.4): reads request parameters/bodies, calls the service,
// maps results to HTTP responses, forwards errors to next(). No business
// logic, no model access, no fabricated endpoint behavior.
//
// Route wiring arrives with the endpoint contracts in M3+.
module.exports = {};
