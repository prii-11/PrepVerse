// UserService — business/application layer for the users module.
// M4.1: /users/me/profile (GET, PATCH) and /users/me/skill-profile (GET).
//
// Owned model (docs/05 §2): User — the only model this service may touch.
// Read-only dependency: RoleSkillCatalog (docs/05 §5) — targetRole must
// exactly match a catalog role before it can be persisted on the profile.
// All user data leaves the service through toSafeUser (user.safe.js) so there
// is exactly one serialization path.
const User = require('./user.model');
const RoleSkillCatalog = require('../analytics/roleSkillCatalog.model');
const { toSafeUser } = require('./user.safe');
const { NotFoundError, ValidationError } = require('../../utils/errors');

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  const safe = toSafeUser(user);
  return {
    targetRole: safe.profile?.targetRole ?? null,
    experienceLevel: safe.profile?.experienceLevel ?? null,
  };
}

async function updateProfile(userId, patch) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  const safe = toSafeUser(user);
  let targetRole = safe.profile?.targetRole ?? null;
  if (patch.targetRole !== undefined) {
    // Catalog-backed (docs/05 §5): exact match against RoleSkillCatalog.role,
    // no fuzzy match. Service-layer because the catalog lookup is a DB query.
    const validOptions = await RoleSkillCatalog.distinct('role');
    if (!validOptions.includes(patch.targetRole)) {
      throw new ValidationError(
        `targetRole '${patch.targetRole}' is not in the RoleSkillCatalog`,
        { validOptions }
      );
    }
    targetRole = patch.targetRole;
  }

  const experienceLevel =
    patch.experienceLevel !== undefined ? patch.experienceLevel : safe.profile?.experienceLevel ?? null;

  // profileCompleted flips true exactly once both targetRole and
  // experienceLevel are present (docs/05 §2). It never flips back.
  const set = {};
  if (patch.targetRole !== undefined) set['profile.targetRole'] = targetRole;
  if (patch.experienceLevel !== undefined) set['profile.experienceLevel'] = experienceLevel;
  if (targetRole && experienceLevel) set.profileCompleted = true;

  const updated = await User.findByIdAndUpdate(userId, { $set: set }, { new: true, runValidators: true });
  if (!updated) {
    throw new NotFoundError('User not found');
  }

  return {
    targetRole: updated.profile?.targetRole ?? null,
    experienceLevel: updated.profile?.experienceLevel ?? null,
  };
}

async function getSkillProfile(userId) {
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  // currentSkillProfile as stored (docs/05 §2), empty-by-default. No
  // SkillProfileService exists yet, so empty arrays / null updatedAt are the
  // expected real state — never fabricated data.
  const safe = toSafeUser(user);
  return {
    skills: safe.currentSkillProfile?.skills ?? [],
    skillGaps: safe.currentSkillProfile?.skillGaps ?? [],
    updatedAt: safe.currentSkillProfile?.updatedAt ?? null,
  };
}

module.exports = { getProfile, updateProfile, getSkillProfile };
