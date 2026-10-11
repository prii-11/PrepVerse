// Authentication service — register, login, logout, me.
// Posts through the shared axios client (docs/02 §3). The access token is
// held in api.js module state only — never localStorage (docs/06 §5.4).
// Response shapes:
//   login/register → { token, user }
//   me             → { user }
//   logout         → { message }
import api from './api';

export const authService = {
  async login({ email, password }) {
    const { data } = await api.post('/auth/login', { email, password });
    return data;
  },

  async register({ firstName, lastName, email, password }) {
    const { data } = await api.post('/auth/register', { firstName, lastName, email, password });
    return data;
  },

  async me() {
    const { data } = await api.get('/auth/me');
    return data;
  },

  async logout() {
    const { data } = await api.post('/auth/logout');
    return data;
  },
};
