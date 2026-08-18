// User service — the only caller of the users endpoints (docs/02 §3):
// profile (GET/PATCH) and skill-profile (GET). All calls flow through the
// shared axios client so the Bearer token is attached automatically.
import api from './api';

export const userService = {
  async getProfile() {
    const { data } = await api.get('/users/me/profile');
    return data; // { targetRole, experienceLevel }
  },

  async updateProfile(patch) {
    const { data } = await api.patch('/users/me/profile', patch);
    return data; // { targetRole, experienceLevel }
  },

  async getSkillProfile() {
    const { data } = await api.get('/users/me/skill-profile');
    return data; // { skills, skillGaps, updatedAt }
  },
};