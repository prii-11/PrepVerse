// Mock practice service that provides a lightweight training plan.
import { createMockResponse } from '../utils/helpers';

export const practiceService = {
  getPracticePlan: async () =>
    createMockResponse({
      days: [
        { day: 'Day 1', focus: 'Resume review and self-introduction' },
        { day: 'Day 2', focus: 'Core technical questions' },
        { day: 'Day 3', focus: 'Behavioral stories and mock round' },
      ],
    }),
};
