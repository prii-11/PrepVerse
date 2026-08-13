// Mock resume service used to simulate analysis and scoring flows.
import { createMockResponse } from '../utils/helpers';

export const resumeService = {
  uploadResume: async () => createMockResponse({ message: 'Resume uploaded successfully.' }),
  analyzeResume: async () =>
    createMockResponse({
      score: 86,
      strengths: ['Clean work history', 'Relevant projects'],
      suggestions: ['Add measurable outcomes', 'Highlight leadership impact'],
    }),
};
