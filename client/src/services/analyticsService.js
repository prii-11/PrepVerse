// Analytics service — the only caller of the analytics endpoints
// (docs/02 §3): readiness, progress, practice-plan. All read-only; all calls
// flow through the shared axios client so the Bearer token is attached.
import api from './api';

export const analyticsService = {
  async getReadiness() {
    const { data } = await api.get('/analytics/readiness');
    return data; // { score, breakdown, interviewCount }
  },

  async getProgress() {
    const { data } = await api.get('/analytics/progress');
    return data; // { points: [{ interviewId, completedAt, overallScore }] }
  },

  async getPracticePlan() {
    const { data } = await api.get('/analytics/practice-plan');
    return data; // { targetRole, skillGaps }
  },
};