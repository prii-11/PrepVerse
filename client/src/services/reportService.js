// Mock report service that powers the interview summary page.
import { createMockResponse } from '../utils/helpers';

export const reportService = {
  getInterviewReport: async () =>
    createMockResponse({
      overallScore: 84,
      strengths: ['Clarity', 'Confidence'],
      weaknesses: ['Pace control', 'Depth of examples'],
      feedback: ['Pause before answering', 'Quantify impact in every story'],
    }),
};
