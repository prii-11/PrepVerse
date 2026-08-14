// Safe user serialization — the single transformation shared by register,
// login, and /me so all three return the exact same shape (docs/06 §1.1.2,
// M3 §8). Strips passwordHash and any other non-public/auth material.
function toSafeUser(user) {
  return {
    _id: user._id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    profileCompleted: user.profileCompleted,
    profile: user.profile ?? null,
    currentSkillProfile: user.currentSkillProfile ?? null,
  };
}

module.exports = { toSafeUser };
