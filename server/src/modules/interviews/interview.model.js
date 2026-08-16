// Mongoose Interview model — docs/05-database-schema.md §4 (the most complex
// embedded shape; take care when editing).
const mongoose = require('mongoose');
const { Schema } = mongoose;

const questionSchema = new Schema({
  // Server-generated subdocument _id (docs/05 §4, Design 7 correction #3).
  // `auto: true` is the explicit default for ObjectId _id fields.
  _id: { type: Schema.Types.ObjectId, auto: true },
  text: String,
  category: String,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },
  expectedTopics: [
    {
      skillKey: { type: String, required: true },
      topic: { type: String, required: true },
    },
  ],
});

const topicAssessmentSchema = new Schema({
  // skillKey belongs to the question's expected-topic skill-key set and is
  // unique within one answer evaluation (docs/05 §4 invariant, corrected §4
  // schema). Uniqueness is a service/schema-validation invariant, not a
  // MongoDB index on array elements.
  skillKey: { type: String, required: true },
  topic: String,
  addressed: Boolean,
  quality: { type: String, enum: ['missing', 'weak', 'good', 'strong'] },
});

const answerSchema = new Schema({
  questionId: { type: Schema.Types.ObjectId, required: true }, // references questions[]._id
  text: String,
  evaluationStatus: {
    type: String,
    enum: ['PENDING', 'EVALUATING', 'COMPLETED', 'FAILED'],
    default: 'PENDING',
  },
  evaluation: {
    correctness: Number, // 0-100, only ever a value that PASSED schema validation
    technicalDepth: Number,
    communication: Number,
    strengths: [String],
    weaknesses: [String],
    improvementTip: String,
    topicAssessments: [topicAssessmentSchema],
    promptVersion: String,
    model: String,
  },
  evaluatedAt: Date,
});

const interviewSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  targetRole: String,
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'] },

  status: {
    type: String,
    enum: ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'COMPLETED', 'EVALUATION_FAILED', 'CANCELLED'],
    default: 'CREATED',
  },

  // questionGeneration is a SEPARATE field tree from Interview.status
  // (docs/05 §4, Design 6 correction #3) — do not conflate the two.
  questionGeneration: {
    status: { type: String, enum: ['PENDING', 'COMPLETED', 'FAILED'], default: 'PENDING' },
    promptVersion: String,
    model: String,
    // Set only on FAILED — the failure/error code, never raw model output;
    // mirrors Resume.failureReason (docs/05 §3) for the same reason (audit
    // debugging, never exposed to the client as-is). docs/05 §4.
    failureReason: String,
  },

  questions: [questionSchema],

  answers: [answerSchema],

  report: {
    overallScore: Number, // computed: weighted avg of per-answer evaluations
    technicalScore: Number, // computed: 0.60×correctness + 0.40×technicalDepth, avg'd
    communicationScore: Number,
    strengths: [String],
    weaknesses: [String],
    recommendations: [String],
    generatedAt: Date,
    // profileSyncStatus is nested under report — NOT a top-level Interview
    // field, and independent of Interview.status (docs/05 §4, Design 8 revised).
    profileSyncStatus: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
  },

  startedAt: Date,
  completedAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Supports listing, filtering by status, and the readiness/progress queries
// ("recent completed interviews for this user").
interviewSchema.index({ userId: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('Interview', interviewSchema);
