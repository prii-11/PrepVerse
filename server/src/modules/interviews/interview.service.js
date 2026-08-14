// InterviewService — business/application layer for the interviews module.
// M4.3: lifecycle endpoints (list, detail, start, answers, cancel, report).
//
// Owned model (docs/05 §4): Interview — the only model this service may touch.
// Ownership (docs/06 §2): every by-id lookup is findOne({ _id, userId }) —
// "not found" and "not yours" are the same 404, never a 403.
// start/cancel are ATOMIC: the status precondition lives in the query itself
// (findOneAndUpdate), so a concurrent duplicate request cannot perform the
// same transition twice. A follow-up exists() read happens ONLY to classify a
// null result as 404 (not owned / missing) vs 409 (owned but wrong state).
const Interview = require('./interview.model');
const { NotFoundError, ConflictError } = require('../../utils/errors');

async function assertOwned(userId, id) {
  const owned = await Interview.exists({ _id: id, userId });
  if (!owned) {
    throw new NotFoundError('Interview not found');
  }
}

async function listInterviews(userId) {
  const interviews = await Interview.find({ userId }).sort({ createdAt: -1 });
  // List view is a lightweight summary — full questions/answers/report belong
  // to the detail view (docs/02 §3). The { userId, status, createdAt } index
  // serves this query.
  return interviews.map((interview) => ({
    _id: interview._id,
    targetRole: interview.targetRole ?? null,
    difficulty: interview.difficulty ?? null,
    status: interview.status,
    createdAt: interview.createdAt,
    startedAt: interview.startedAt ?? null,
    completedAt: interview.completedAt ?? null,
  }));
}

async function getInterview(userId, id) {
  const interview = await Interview.findOne({ _id: id, userId });
  if (!interview) {
    throw new NotFoundError('Interview not found');
  }
  // Real persisted structure — status, questionGeneration, questions,
  // answers (with their default evaluationStatus), report when present,
  // timestamps. Nothing fabricated for unprocessed states.
  const detail = interview.toObject({ versionKey: false });
  delete detail.userId;
  return detail;
}

async function startInterview(userId, id) {
  const startedAt = new Date();
  const updated = await Interview.findOneAndUpdate(
    { _id: id, userId, status: 'CREATED' },
    { $set: { status: 'IN_PROGRESS', startedAt } },
    { new: true }
  );
  if (!updated) {
    await assertOwned(userId, id);
    throw new ConflictError('Interview has already started', { code: 'INTERVIEW_ALREADY_STARTED' });
  }
  return { _id: updated._id, status: updated.status, startedAt: updated.startedAt };
}

async function addAnswer(userId, id, { questionId, text }) {
  const interview = await Interview.findOne({ _id: id, userId });
  if (!interview) {
    throw new NotFoundError('Interview not found');
  }
  if (interview.status !== 'IN_PROGRESS') {
    throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
  }
  // questionId must reference a question embedded in THIS interview — an id
  // from a different interview is rejected with 404, nothing appended.
  const question = interview.questions.find((q) => q._id.toString() === questionId);
  if (!question) {
    throw new NotFoundError('Question not found');
  }
  // Append-only. The schema default evaluationStatus ('PENDING') applies; no
  // evaluation, no interview state change.
  interview.answers.push({ questionId, text });
  await interview.save();
  const answer = interview.answers[interview.answers.length - 1];
  return {
    _id: answer._id,
    questionId: answer.questionId,
    text: answer.text,
    evaluationStatus: answer.evaluationStatus,
  };
}

async function cancelInterview(userId, id) {
  const updated = await Interview.findOneAndUpdate(
    { _id: id, userId, status: { $in: ['CREATED', 'IN_PROGRESS'] } },
    { $set: { status: 'CANCELLED' } },
    { new: true }
  );
  if (!updated) {
    await assertOwned(userId, id);
    throw new ConflictError('Interview cannot be cancelled from its current state', {
      code: 'INTERVIEW_NOT_CANCELLABLE',
    });
  }
  return { _id: updated._id, status: updated.status };
}

async function getReport(userId, id) {
  const interview = await Interview.findOne({ _id: id, userId });
  if (!interview) {
    throw new NotFoundError('Interview not found');
  }
  // Read-only: returns the persisted report if present. Mongoose initializes
  // the nested report subdocument (with its defaults) even when none was ever
  // written, so "empty" means no real content — discriminate by the primary
  // computed score, which a real report always carries. No report → 404 with
  // a specific message rather than a 200-with-null (M4.3 §11, resolved gap).
  if (!interview.report || interview.report.overallScore == null) {
    throw new NotFoundError('Report not yet available');
  }
  return interview.report.toObject();
}

module.exports = { listInterviews, getInterview, startInterview, addAnswer, cancelInterview, getReport };
