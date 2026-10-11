// Interview service — drives the full interview lifecycle against the
// documented backend contract (docs/02 §3):
//   POST   /interviews          → 201 detail (with generated questions)
//   GET    /interviews           → 200 summary list
//   GET    /interviews/:id       → 200 detail
//   POST   /interviews/:id/start → 200 { _id, status, startedAt }
//   POST   /interviews/:id/answers → 201 answer record
//   POST   /interviews/:id/submit  → 200 detail (with report)
//   POST   /interviews/:id/cancel  → 200 { _id, status }
//   GET    /interviews/:id/report  → 200 report object
// All calls flow through the shared axios client (Bearer auto-attached).
import api from './api';

// Backend report does not include questionResults. The UI (InterviewReport)
// expects report.questionResults = [{ text, category, strengths, weaknesses,
// technicalScore, communicationScore }, ...]. Construct from the interview's
// questions + answers arrays, matching each answer to its question by questionId.
function buildQuestionResults(interview) {
  if (!interview?.questions || !interview?.answers) return [];
  const questionsById = new Map(interview.questions.map((q) => [q._id, q]));
  return interview.answers
    .filter((a) => a.evaluationStatus === 'COMPLETED' && a.evaluation)
    .map((answer) => {
      const question = questionsById.get(answer.questionId);
      const eval_ = answer.evaluation;
      return {
        text: question?.text ?? '',
        category: question?.category ?? '',
        strengths: eval_.strengths ?? [],
        weaknesses: eval_.weaknesses ?? [],
        technicalScore:
          eval_.correctness != null && eval_.technicalDepth != null
            ? Math.round(0.6 * eval_.correctness + 0.4 * eval_.technicalDepth)
            : null,
        communicationScore: eval_.communication ?? null,
      };
    });
}

export const interviewService = {
  async listInterviews() {
    const { data } = await api.get('/interviews');
    return data;
  },

  async getInterview(id) {
    const { data } = await api.get(`/interviews/${id}`);
    return data;
  },

  // POST /interviews → 201 detail with generated questions.
  // difficulty is lowercased to match backend validation (docs/07 §3):
  // enum ['easy', 'medium', 'hard']. The UI sends capitalized labels;
  // lowercasing here keeps the backend contract authoritative.
  async createInterview({ targetRole, difficulty, questionCount = 4 }) {
    const { data } = await api.post('/interviews', {
      targetRole,
      difficulty: String(difficulty).toLowerCase(),
      questionCount,
    });
    return data;
  },

  // POST /:id/start — atomic CREATED → IN_PROGRESS; 409 on invalid transition.
  async startInterview(id) {
    const { data } = await api.post(`/interviews/${id}/start`);
    return data;
  },

  // POST /:id/answers — append-only; blank text is accepted (scored 0 at
  // evaluation time, docs/20 §3 lifecycle).
  async addAnswer(id, { questionId, text }) {
    const { data } = await api.post(`/interviews/${id}/answers`, { questionId, text });
    return data;
  },

  // POST /:id/submit — synchronous evaluation; resolves with the final detail
  // including the report (docs/20 §3). Construct questionResults for the UI.
  async submitInterview(id) {
    const { data } = await api.post(`/interviews/${id}/submit`);
    return {
      ...data,
      report: {
        ...data.report,
        questionResults: buildQuestionResults(data),
      },
    };
  },

  // POST /:id/cancel — allowed any time before COMPLETED.
  async cancelInterview(id) {
    const { data } = await api.post(`/interviews/${id}/cancel`);
    return data;
  },

  // GET /:id/report — 404 "Report not yet available" until COMPLETED.
  async getReport(id) {
    const { data } = await api.get(`/interviews/${id}/report`);
    return data;
  },
};
