// Authentication service — the only caller of the auth endpoints
// (docs/02 §3): register, login, logout, me. All calls flow through the
// shared axios client so the Bearer token is attached automatically.
import api from './api';

export const authService = {
  async register(payload) {
    const { data } = await api.post('/auth/register', payload);
    return data; // { token, user }
  },

  async login(credentials) {
    const { data } = await api.post('/auth/login', credentials);
    return data; // { token, user }
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data; // { user }
  },

  async logout() {
    const { data } = await api.post('/auth/logout');
    return data; // { message }
  },
};