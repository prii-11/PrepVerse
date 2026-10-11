// authService unit tests — verifies real API calls through the shared axios
// client (docs/02 §3). No mock data, no delay(): every test asserts the
// correct HTTP call and response shape.
import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
  },
}));

import api from './api';
import { authService } from './authService';

const USER = { _id: 'u1', email: 'a@b.c', firstName: 'A', lastName: 'B', profileCompleted: false, profile: null, currentSkillProfile: null };

describe('authService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('login', () => {
    it('POSTs /auth/login with credentials and returns {token, user}', async () => {
      const payload = { token: 'jwt-abc', user: USER };
      api.post.mockResolvedValue({ data: payload });

      const result = await authService.login({ email: 'a@b.c', password: 'secret1A' });

      expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'a@b.c', password: 'secret1A' });
      expect(result).toEqual(payload);
      expect(result.token).toBe('jwt-abc');
      expect(result.user).toEqual(USER);
    });
  });

  describe('register', () => {
    it('POSTs /auth/register with profile and returns {token, user}', async () => {
      const body = { firstName: 'A', lastName: 'B', email: 'a@b.c', password: 'Secret1A' };
      const payload = { token: 'jwt-new', user: USER };
      api.post.mockResolvedValue({ data: payload });

      const result = await authService.register(body);

      expect(api.post).toHaveBeenCalledWith('/auth/register', body);
      expect(result).toEqual(payload);
      expect(result.token).toBe('jwt-new');
      expect(result.user).toEqual(USER);
    });
  });

  describe('me', () => {
    it('GETs /auth/me and returns {user}', async () => {
      api.get.mockResolvedValue({ data: { user: USER } });

      const result = await authService.me();

      expect(api.get).toHaveBeenCalledWith('/auth/me');
      expect(result).toEqual({ user: USER });
    });
  });

  describe('logout', () => {
    it('POSTs /auth/logout and returns {message}', async () => {
      api.post.mockResolvedValue({ data: { message: 'Logged out' } });

      const result = await authService.logout();

      expect(api.post).toHaveBeenCalledWith('/auth/logout');
      expect(result).toEqual({ message: 'Logged out' });
    });
  });

  describe('API error propagation', () => {
    it('rethrows non-2xx errors from login', async () => {
      const error = Object.assign(new Error('Request failed'), {
        response: { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Invalid credentials' } } },
      });
      api.post.mockRejectedValue(error);

      await expect(authService.login({ email: 'x', password: 'y' })).rejects.toThrow('Request failed');
      expect(api.post).toHaveBeenCalledWith('/auth/login', { email: 'x', password: 'y' });
    });

    it('rethrows non-2xx errors from register', async () => {
      const error = Object.assign(new Error('Conflict'), {
        response: { status: 409, data: { error: { code: 'CONFLICT', message: 'Account exists' } } },
      });
      api.post.mockRejectedValue(error);

      await expect(authService.register({ firstName: 'A', lastName: 'B', email: 'x', password: 'y' })).rejects.toThrow('Conflict');
    });

    it('rethrows non-2xx errors from me', async () => {
      const error = Object.assign(new Error('Not found'), {
        response: { status: 404, data: { error: { code: 'NOT_FOUND', message: 'User not found' } } },
      });
      api.get.mockRejectedValue(error);

      await expect(authService.me()).rejects.toThrow('Not found');
    });
  });

  describe('401 error propagation', () => {
    it('propagates 401 errors from login without modifying them', async () => {
      const error = Object.assign(new Error('Unauthorized'), {
        response: { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } },
      });
      api.post.mockRejectedValue(error);

      try {
        await authService.login({ email: 'x', password: 'y' });
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBe(error);
        expect(err.response.status).toBe(401);
      }
    });

    it('propagates 401 errors from me without modifying them', async () => {
      const error = Object.assign(new Error('Unauthorized'), {
        response: { status: 401, data: { error: { code: 'UNAUTHORIZED', message: 'Authentication required' } } },
      });
      api.get.mockRejectedValue(error);

      try {
        await authService.me();
        expect.fail('should have thrown');
      } catch (err) {
        expect(err).toBe(error);
        expect(err.response.status).toBe(401);
      }
    });
  });
});
