// Mongoose RoleSkillCatalog model — docs/05-database-schema.md §5.
// Lives in the analytics module because it is the deterministic denominator
// for skill-coverage computation (the analytics core).
const mongoose = require('mongoose');
const { Schema } = mongoose;

const roleSkillCatalogSchema = new Schema({
  role: { type: String, required: true, unique: true, index: true }, // e.g. "Backend Developer"
  requiredSkills: [
    {
      skillKey: { type: String, required: true },
      weight: { type: Number, required: true, min: 0 },
      minimumLevel: { type: String, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'], required: true },
    },
  ],
  updatedAt: Date,
});

module.exports = mongoose.model('RoleSkillCatalog', roleSkillCatalogSchema);
