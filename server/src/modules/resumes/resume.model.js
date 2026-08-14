// Mongoose Resume model — docs/05-database-schema.md §3.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const resumeSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  storageKey: { type: String, required: true }, // Supabase Storage path
  originalFilename: String,
  mimeType: String,
  size: Number,

  status: { type: String, enum: ['UPLOADED', 'ANALYZED', 'FAILED'], default: 'UPLOADED' },
  // Note: no PROCESSING state — MVP resume upload is synchronous (docs/05 §3).

  analysis: {
    extractedSkills: [String],
    experienceSummary: String,
    projects: [{ name: String, description: String, technologies: [String] }],
    strengths: [String],
    skillGaps: [String],
    promptVersion: String, // e.g. "resume-analysis-v1"
    model: String, // e.g. "gemini-2.5-flash"
  },

  // Set only if status: FAILED — an errorCode, never raw model output.
  failureReason: String,

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Supports "list my resumes, most recent first" and every ownership check.
resumeSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('Resume', resumeSchema);
