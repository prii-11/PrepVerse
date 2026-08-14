// RoleSkillCatalogService — business/application layer for the analytics
// module's catalog. Structural seam only (M2.4): no business behavior is
// implemented yet. Skill-coverage / readiness computation is out of scope
// until the later milestones (ReadinessService, SkillProfileService).
//
// Owned model (docs/05 §5): RoleSkillCatalog — the only model this service may
// touch. The import below is intentional: it pins the service -> model edge.
const RoleSkillCatalog = require('./roleSkillCatalog.model');

module.exports = {};
