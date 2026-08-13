// Mock authentication service that can later be replaced with backend calls.
import { createMockResponse } from '../utils/helpers';

export const authService = {
  login: async (credentials) =>
    createMockResponse({
      token: 'demo-token',
      user: { name: credentials?.email?.split('@')[0] || 'Student', email: credentials?.email || 'student@example.com' },
    }),
  signup: async (payload) =>
    createMockResponse({
      token: 'demo-token',
      user: { name: payload?.name || 'New Student', email: payload?.email || 'student@example.com' },
    }),
  logout: async () => createMockResponse({ success: true }),
};
