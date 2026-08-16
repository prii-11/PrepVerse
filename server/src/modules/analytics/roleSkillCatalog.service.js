// RoleSkillCatalogService — business/application layer for the analytics
// module's catalog. Structural seam only until M5.3 adds the lookup below:
// interview creation validates targetRole against this catalog (docs/02 §3,
// docs/05 §5) — exact match, never fuzzy, never AI-generated (human-curated
// catalog only).
//
// Owned model (docs/05 §5): RoleSkillCatalog — the only model this service may
// touch. The import below is intentional: it pins the service -> model edge.
const RoleSkillCatalog = require('./roleSkillCatalog.model');

// Exact-match role lookup (docs/05 §5, M5.3 resolution): targetRole must
// exactly equal RoleSkillCatalog.role or the request is invalid. Returns the
// catalog document or null — the caller decides the error classification.
async function findByRole(role) {
  return RoleSkillCatalog.findOne({ role });
}

module.exports = { findByRole };