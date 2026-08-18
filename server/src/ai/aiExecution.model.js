// Mongoose AIExecution model — docs/05-database-schema.md §6.
// One document per AI provider/model ATTEMPT (M5.7): a logical operation that
// fails over across candidates produces one row per attempt, so the full
// chain, failure reasons, and the final producer are reconstructible.
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

  // M5.7 failover provenance — one document per provider/model attempt of a
  // logical AI operation. `attempt` is the 1-based total call index across
  // the whole operation; `fallbackFrom` is the "provider/model" label of the
  // candidate this attempt was reached from; `fallbackReason` is that
  // candidate's failure category (e.g. QUOTA_EXHAUSTED). null on the first
  // attempt and on non-failover paths.
  attempt: Number,
  fallbackFrom: String,
  fallbackReason: String,

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
