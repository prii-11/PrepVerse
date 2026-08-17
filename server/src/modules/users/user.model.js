// Mongoose User model — docs/05-database-schema.md §2.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const skillEvidenceSchema = new Schema({
  interviewId: { type: Schema.Types.ObjectId, ref: 'Interview' },
  answerIds: [{ type: Schema.Types.ObjectId }],
  signal: { type: Number, min: 0, max: 3 },
  assessedAt: Date,
});

const skillSchema = new Schema({
  skillKey: { type: String, required: true },
  sources: [{ type: String, enum: ['RESUME', 'INTERVIEW'], required: true }],
  // Uniqueness of values within sources[] is a service-layer invariant
  // (docs/05 §2 note) — NOT expressible as a Mongoose array-unique constraint.
  assessed: { type: Boolean, default: false },
  level: { type: String, enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED', null], default: null },
  // M5.5 (docs/08 §9a): at-risk neighborhood — the most recent interview
  // assessed this skill but produced only 'missing' addressed signals.
  potentialGap: { type: Boolean, default: false },
  evidenceLog: [skillEvidenceSchema],
  lastAssessed: Date,
});

const userSchema = new Schema({
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  passwordHash: { type: String, required: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, required: true, trim: true },
  profileCompleted: { type: Boolean, default: false },

  profile: {
    // targetRole is validated against RoleSkillCatalog.role; not arbitrary free text
    // (service-layer concern, enforced when onboarding is implemented).
    targetRole: { type: String },
    experienceLevel: { type: String, enum: ['Student', 'Entry', 'Junior'] },
  },

  currentSkillProfile: {
    skills: [skillSchema],
    skillGaps: [String],
    updatedAt: Date,
  },

  // No readinessScore field anywhere — deliberate. Readiness is computed on
  // read by ReadinessService (docs/05 §2 note) and never stored. Do not "fix"
  // this later by adding one.

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('User', userSchema);
