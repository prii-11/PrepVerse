// InterviewService — business/application layer for the interviews module.
// M4.3: lifecycle endpoints (list, detail, start, answers, cancel, report).
// M5.3: creation (createInterview) — the create → generate → persist sequence.
//
// Owned model (docs/05 §4): Interview — the only model this service may write
// to. Read-only dependencies: RoleSkillCatalog (via roleSkillCatalog.service —
// exact-match targetRole, docs/05 §5) and User (currentSkillProfile for the
// QuestionGenerator input, docs/05 §7).
// Ownership (docs/06 §2): every by-id lookup is findOne({ _id, userId }) —
// "not found" and "not yours" are the same 404, never a 403.
// start/cancel are ATOMIC: the status precondition lives in the query itself
// (findOneAndUpdate), so a concurrent duplicate request cannot perform the
// same transition twice. A follow-up exists() read happens ONLY to classify a
// null result as 404 (not owned / missing) vs 409 (owned but wrong state).
const Interview = require('./interview.model');
const User = require('../users/user.model');
const roleSkillCatalogService = require('../analytics/roleSkillCatalog.service');
const questionGenerator = require('../../ai/questionGenerator');
const { NotFoundError, ConflictError, ValidationError, AIProviderError } = require('../../utils/errors');

async function assertOwned(userId, id) {
  const owned = await Interview.exists({ _id: id, userId });
  if (!owned) {
    throw new NotFoundError('Interview not found');
  }
}

// M5.3 creation sequence (docs/02 §3, docs/07 §3; resolved contract §0.5):
// catalog-exact targetRole → create Interview (CREATED/PENDING) → generate via
// QuestionGenerator → ONE atomic update on success (questions + COMPLETED) or
// ONE atomic update on failure (FAILED + failureReason). No transaction (the
// Gemini call cannot be inside one), no idempotency (plain REST creation), no
// no retry endpoint (FAILED is terminal; recovery = cancel + recreate).
async function createInterview(userId, { targetRole, difficulty, questionCount }) {
  // Exact-match catalog validation (docs/05 §5): unknown role → the request
  // body contains a bad field value → ValidationError, the only non-invented
  // classification in the existing taxonomy.
  const role = await roleSkillCatalogService.findByRole(targetRole);
  if (!role) {
    throw new ValidationError(`targetRole '${targetRole}' is not in the RoleSkillCatalog`);
  }

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // questionCount: optional in the request, MVP default 4, range 3-5 enforced
  // at validation (docs/07 §3).
  const count = questionCount ?? 4;

  // Interview exists before the AI call — always CREATED, never advanced by
  // question generation success or failure (independent state trees).
  const interview = await Interview.create({
    userId,
    targetRole,
    difficulty,
    status: 'CREATED',
    questionGeneration: { status: 'PENDING' },
  });

  // QuestionGenerator input sourcing: currentSkillProfile from the user's own
  // document (docs/05 §7 flow), previousWeaknesses from past COMPLETED
  // interview reports (empty array when none exist — the common case, since
  // no evaluation flow exists yet).
  const currentSkillProfile = user.currentSkillProfile ?? {};
  const previousWeaknesses = await Interview.find(
    { userId, status: 'COMPLETED', 'report.weaknesses': { $exists: true, $ne: [] } },
    { 'report.weaknesses': 1 }
  ).then((completed) => completed.flatMap((entry) => entry.report?.weaknesses ?? []));

  try {
    const { questions, promptVersion, model } = await questionGenerator.generateQuestions({
      targetRole,
      difficulty,
      questionCount: count,
      currentSkillProfile: {
        skills: currentSkillProfile.skills ?? [],
        skillGaps: currentSkillProfile.skillGaps ?? [],
      },
      previousWeaknesses,
      userId,
      interviewId: interview._id,
    });

    // SUCCESS — ONE atomic update (resolved §0.5.3): questions[] +
    // questionGeneration.{status, promptVersion, model} in a single
    // findOneAndUpdate so a crash cannot leave questions persisted with the
    // status still PENDING. Gemini's string `id` is explicitly discarded here
    // (resolved §0.5.7): Mongoose's auto ObjectId `_id` owns question identity.
    const persisted = await Interview.findOneAndUpdate(
      { _id: interview._id },
      {
        $set: {
          questions: questions.map(({ id, ...question }) => question),
          'questionGeneration.status': 'COMPLETED',
          'questionGeneration.promptVersion': promptVersion,
          'questionGeneration.model': model,
        },
      },
      { new: true }
    );

    if (!persisted) {
      throw new NotFoundError('Interview not found');
    }

    const detail = persisted.toObject({ versionKey: false });
    delete detail.userId;
    return detail;
  } catch (error) {
    // FAILURE — ONE atomic update (resolved §0.5.3). failureReason is the
    // error CODE (details.failure from the orchestrator's AIProviderError,
    // e.g. SCHEMA_VALIDATION_FAILED / RATE_LIMITED / AI_PROVIDER_FAILED),
    // never raw model output (docs/05 §4). A failing FAILED-write must not
    // mask the original error — logged, then rethrow always.
    const failureReason =
      error instanceof AIProviderError && error.details?.failure ? error.details.failure : error.code || 'AI_PROVIDER_FAILED';
    try {
      await Interview.findOneAndUpdate(
        { _id: interview._id },
        {
          $set: {
            'questionGeneration.status': 'FAILED',
            'questionGeneration.failureReason': failureReason,
          },
        }
      );
    } catch (updateError) {
      console.error(`[interview] failed to persist questionGeneration FAILED state: ${updateError.message}`);
    }
    throw error;
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

module.exports = {
  createInterview,
  listInterviews,
  getInterview,
  startInterview,
  addAnswer,
  cancelInterview,
  getReport,
};
