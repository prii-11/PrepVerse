// Mongoose AIExecution model — docs/05-database-schema.md §6.
// One document per AI call to Gemini, for debugging and AI-abuse monitoring.
const mongoose = require('mongoose');
const { Schema } = mongoose;

const aiExecutionSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  operation: { type: String, enum: ['RESUME_ANALYSIS', 'QUESTION_GENERATION', 'ANSWER_EVALUATION'] },
  entityType: { type: String, enum: ['RESUME', 'INTERVIEW'] },
  entityId: { type: Schema.Types.ObjectId, index: true },

  provider: { type: String, default: 'gemini' },
  model: String,
  promptVersion: String,

  status: { type: String, enum: ['SUCCESS', 'FAILED'] },
  latencyMs: Number,
  tokenUsage: { input: Number, output: Number },
  errorCode: String, // set only on FAILED — e.g. "SCHEMA_VALIDATION_FAILED", "RATE_LIMITED"

  // Mixed-type (Object) field. Sanitized structured summary ONLY (docs/06 §4.3,
  // applies to dev AND prod) — never raw prompt text, never raw resume/answer
  // content, never unrestricted model output. e.g. { fieldsReturned: [...],
  // validationPassed: Boolean }.
  outputSummary: { type: Object },

  createdAt: { type: Date, default: Date.now },
});

// Supports "show me every AI call related to this specific interview/resume".
aiExecutionSchema.index({ entityType: 1, entityId: 1 });
// Supports the AI-abuse-monitoring use case (docs/06 §4.2).
aiExecutionSchema.index({ userId: 1, createdAt: -1 });

module.exports = mongoose.model('AIExecution', aiExecutionSchema);
