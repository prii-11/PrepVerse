// InterviewService — business/application layer for the interviews module.
// M4.3: lifecycle endpoints (list, detail, start, answers, cancel, report).
// M5.3: creation (createInterview) — the create → generate → persist sequence.
// M5.4: submission (submitInterview) — the two-CAS evaluation lifecycle, report
// aggregation, and the extended cancellation allow-list (docs/02 §3).
//
// Owned model (docs/05 §4): Interview — the only model this service may write
// to. Read-only dependencies: RoleSkillCatalog (via roleSkillCatalog.service —
// exact-match targetRole, docs/05 §5), User (currentSkillProfile for the
// QuestionGenerator input, docs/05 §7; profile for the answer-evaluation input
// contract, docs/07 §4).
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
const answerEvaluator = require('../../ai/answerEvaluator');
const { SCORING_CONFIG } = require('../../config/scoring');
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

// Feedback payload for programmatically-evaluated blank answers (docs/07 §4:
// a genuinely blank/empty candidateAnswer is caught BEFORE the LLM call —
// scored 0 across all fields programmatically, no Gemini call spent on it).
const BLANK_ANSWER_FEEDBACK = {
  weakness: 'No answer provided',
  improvementTip: 'Try giving a partial answer — even a brief structured response is better than leaving the question blank.',
};

// Report aggregation (docs/02 §3): strengths/weaknesses/recommendations are
// derived from the COMPLETED answers' per-answer fields — preserving answer
// order then per-answer order, case-insensitive deduplication with first
// occurrence winning, max N, no frequency threshold.
function dedupePreservingOrder(items, max) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = String(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function average(values) {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

// Deterministic backend aggregation (docs/05 §4 note) — no LLM call. Only
// answers with evaluationStatus 'COMPLETED' are included in ANY of the three
// scores and the aggregated lists (docs/07 §4 "included answers"); a
// PENDING/EVALUATING/FAILED answer contributes nothing, never a 0.
function buildReport(completedAnswers) {
  const { EVALUATION_WEIGHTS, REPORT_CAPS } = SCORING_CONFIG;
  const evaluations = completedAnswers.map((answer) => answer.evaluation);

  const overallScore = average(
    evaluations.map(
      (evaluation) =>
        EVALUATION_WEIGHTS.overall.correctness * evaluation.correctness +
        EVALUATION_WEIGHTS.overall.technicalDepth * evaluation.technicalDepth +
        EVALUATION_WEIGHTS.overall.communication * evaluation.communication
    )
  );
  const technicalScore = average(
    evaluations.map(
      (evaluation) =>
        EVALUATION_WEIGHTS.technical.correctness * evaluation.correctness +
        EVALUATION_WEIGHTS.technical.technicalDepth * evaluation.technicalDepth
    )
  );
  const communicationScore = average(evaluations.map((evaluation) => evaluation.communication));

  return {
    overallScore,
    technicalScore,
    communicationScore,
    strengths: dedupePreservingOrder(evaluations.flatMap((evaluation) => evaluation.strengths ?? []), REPORT_CAPS.strengths),
    weaknesses: dedupePreservingOrder(evaluations.flatMap((evaluation) => evaluation.weaknesses ?? []), REPORT_CAPS.weaknesses),
    recommendations: dedupePreservingOrder(
      evaluations.map((evaluation) => evaluation.improvementTip).filter(Boolean),
      REPORT_CAPS.recommendations
    ),
    generatedAt: new Date(),
    // profileSyncStatus lives under report (docs/05 §4, Design 8 revised) and
    // is independent of Interview.status — set to PENDING here so the M5.5
    // SkillProfileService update is the next step.
    profileSyncStatus: 'PENDING',
  };
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

// M5.4 submission lifecycle (docs/02 §3, docs/05 §7): two CAS gates
// (IN_PROGRESS → SUBMITTED, then SUBMITTED → EVALUATING), then one
// ANSWER_EVALUATION call per answer, with EVERY evaluation persistence write
// filtered on status 'EVALUATING' — no load-then-save, no unconditional
// update, so a concurrent cancellation is never silently overwritten. If
// cancel's CAS lands first, the first failed write stops all further
// evaluation work (no more Gemini calls, nothing persisted after CANCELLED).
async function submitInterview(userId, id) {
  // CAS gate 1 — the submission's own atomic idempotency gate: only
  // IN_PROGRESS may submit, and an interview with zero answers must NOT become
  // a COMPLETED interview with null report scores (docs/02 §3) — bundling the
  // answers-exists check into the gate keeps a rejected zero-answer submission
  // from advancing the state to SUBMITTED.
  const interview = await Interview.findOneAndUpdate(
    { _id: id, userId, status: 'IN_PROGRESS', 'answers.0': { $exists: true } },
    { $set: { status: 'SUBMITTED' } },
    { new: true }
  );
  if (!interview) {
    const existing = await Interview.findOne({ _id: id, userId }, { status: 1, answers: 1 });
    if (!existing) {
      throw new NotFoundError('Interview not found');
    }
    if (existing.answers.length === 0) {
      // docs/02 §3: no answers to evaluate — same ConflictError model, no new
      // error code.
      throw new ConflictError('No answers to evaluate');
    }
    throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
  }

  // CAS gate 2 — executed in the same request, immediately before the first
  // per-answer evaluation call (docs/02 §3). Failure means a concurrent cancel
  // (valid from SUBMITTED) landed between the gates.
  const evaluating = await Interview.findOneAndUpdate(
    { _id: id, userId, status: 'SUBMITTED' },
    { $set: { status: 'EVALUATING' } },
    { new: true }
  );
  if (!evaluating) {
    throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
  }

  // AnswerEvaluator input contract (docs/07 §4): question data + the
  // candidate's profile. The interview's own (catalog-validated) targetRole is
  // the role being interviewed for; experienceLevel comes from the user's
  // profile (may legitimately be unset pre-onboarding).
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }
  const candidateProfile = {
    targetRole: evaluating.targetRole ?? '',
    experienceLevel: user.profile?.experienceLevel ?? '',
  };

  const questionsById = new Map(evaluating.questions.map((question) => [question._id.toString(), question]));
  let evaluationError = null;

  // Sequential evaluation loop — one Gemini call per non-blank answer. On the
  // first AI failure the loop stops (the interview's terminal state is already
  // EVALUATION_FAILED; no further free-tier calls are spent on a doomed
  // interview) — remaining answers stay PENDING, completed ones are retained.
  for (const answer of evaluating.answers) {
    const answerId = answer._id;
    const question = questionsById.get(answer.questionId.toString());

    // Per-answer evaluation writes are CAS'd on EVALUATING (docs/02 §3 hard
    // contract) — a failed match means cancel won the race: stop immediately.
    const markEvaluating = async () => {
      const marked = await Interview.findOneAndUpdate(
        { _id: id, status: 'EVALUATING', 'answers._id': answerId },
        { $set: { 'answers.$.evaluationStatus': 'EVALUATING' } }
      );
      if (!marked) {
        throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
      }
    };
    const persistAnswerEvaluation = async (evaluation, status) => {
      const updated = await Interview.findOneAndUpdate(
        { _id: id, status: 'EVALUATING', 'answers._id': answerId },
        {
          $set: {
            'answers.$.evaluationStatus': status,
            ...(status === 'COMPLETED'
              ? {
                  'answers.$.evaluation': evaluation,
                  'answers.$.evaluatedAt': new Date(),
                }
              : {}),
          },
        }
      );
      if (!updated) {
        throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
      }
    };

    // Structural guard: addAnswer enforces questionId belongs to THIS
    // interview, so a missing question is a data-integrity violation — the
    // answer is marked FAILED without an AI call, driving EVALUATION_FAILED.
    if (!question) {
      await markEvaluating();
      await persistAnswerEvaluation(null, 'FAILED');
      continue;
    }

    if (typeof answer.text !== 'string' || answer.text.trim() === '') {
      // docs/07 §4: genuinely blank answer → scored 0 across all fields
      // programmatically, NO Gemini call spent on it. topicAssessments record
      // each expected topic as not addressed (addressed:false contributes no
      // skill evidence downstream, docs/08 §2).
      await markEvaluating();
      const zeroEvaluation = {
        correctness: 0,
        technicalDepth: 0,
        communication: 0,
        strengths: [],
        weaknesses: [BLANK_ANSWER_FEEDBACK.weakness],
        improvementTip: BLANK_ANSWER_FEEDBACK.improvementTip,
        topicAssessments: (question.expectedTopics ?? []).map((topic) => ({
          skillKey: topic.skillKey,
          topic: topic.topic,
          addressed: false,
          quality: 'missing',
        })),
      };
      await persistAnswerEvaluation(zeroEvaluation, 'COMPLETED');
      continue;
    }

    await markEvaluating();
    try {
      const { evaluation, promptVersion, model } = await answerEvaluator.evaluateAnswer({
        question: {
          text: question.text,
          category: question.category,
          difficulty: question.difficulty,
          expectedTopics: question.expectedTopics,
        },
        candidateAnswer: answer.text,
        candidateProfile,
        userId,
        interviewId: id,
      });
      await persistAnswerEvaluation({ ...evaluation, promptVersion, model }, 'COMPLETED');
    } catch (error) {
      // Per-answer evaluation failure (orchestrator retries exhausted) — the
      // answer is marked FAILED via a CAS write; the first error is retained
      // and rethrown AFTER the interview's terminal state is persisted.
      try {
        await persistAnswerEvaluation(null, 'FAILED');
      } catch (raceError) {
        throw raceError;
      }
      evaluationError = error;
      break;
    }
  }

  // Final resolution (docs/05 §7): if any answer FAILED → EVALUATION_FAILED
  // (completed answers retain their evaluations, no report computed); else the
  // report + completedAt + status: COMPLETED land in ONE atomic CAS'd update.
  if (evaluationError) {
    const failed = await Interview.findOneAndUpdate(
      { _id: id, status: 'EVALUATING' },
      { $set: { status: 'EVALUATION_FAILED' } }
    );
    if (!failed) {
      throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
    }
    throw evaluationError;
  }

  // Plain read for aggregation only — the final state write below is still
  // CAS'd on EVALUATING (the read never behaves as a write precondition).
  const current = await Interview.findById(id);
  const completedAnswers = current.answers.filter(
    (answer) => answer.evaluationStatus === 'COMPLETED' && answer.evaluation
  );
  const completed = await Interview.findOneAndUpdate(
    { _id: id, status: 'EVALUATING' },
    {
      $set: {
        status: 'COMPLETED',
        completedAt: new Date(),
        report: buildReport(completedAnswers),
      },
    },
    { new: true }
  );
  if (!completed) {
    throw new ConflictError('Interview is not in progress', { code: 'INTERVIEW_NOT_IN_PROGRESS' });
  }

  // Successful submission response = the same Interview detail shape as
  // GET /:id (docs/02 §3) — no new response envelope.
  const detail = completed.toObject({ versionKey: false });
  delete detail.userId;
  return detail;
}

async function cancelInterview(userId, id) {
  // Cancellation allow-list (docs/02 §3, M5.4): valid from CREATED, IN_PROGRESS,
  // SUBMITTED, EVALUATING, and EVALUATION_FAILED — never from COMPLETED
  // (terminal). CANCELLED is terminal: no transition leads out of it. The
  // status precondition lives in the query, so a concurrent evaluation final
  // write and this CAS settle atomically — whichever lands first wins.
  const updated = await Interview.findOneAndUpdate(
    { _id: id, userId, status: { $in: ['CREATED', 'IN_PROGRESS', 'SUBMITTED', 'EVALUATING', 'EVALUATION_FAILED'] } },
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
  submitInterview,
  cancelInterview,
  getReport,
};
