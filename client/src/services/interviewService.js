// Mock interview service that returns sample questions and evaluation data.
import { createMockResponse } from '../utils/helpers';

export const interviewService = {
  startInterview: async () =>
    createMockResponse({
      interviewId: 'demo-interview',
      questions: ['Tell me about yourself.', 'Describe a challenging project.', 'Why should we hire you?'],
    }),
  submitAnswer: async () => createMockResponse({ score: 78, feedback: 'Good structure with room for stronger examples.' }),
};
