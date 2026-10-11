// Analytics service — readiness, progress, practice-plan (docs/02 §3).
// All three endpoints are read-only GET requests through the shared
// axios client (Bearer auto-attached).
//   GET /analytics/readiness     → { score, breakdown, interviewCount }
//   GET /analytics/progress      → { points: [{interviewId, completedAt, overallScore}] }
//   GET /analytics/practice-plan → { targetRole, skillGaps: [{skillKey, requiredMinimumLevel, currentLevel, reason}] }
import api from './api';

export const analyticsService = {
  async getReadiness() {
    const { data } = await api.get('/analytics/readiness');
    return data;
  },

  async getProgress() {
    const { data } = await api.get('/analytics/progress');
    return data;
  },

  async getPracticePlan() {
    const { data } = await api.get('/analytics/practice-plan');
    return data;
  },
};
