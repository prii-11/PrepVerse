// User service — profile (GET/PATCH) and skill-profile (GET).
// Backend contract (docs/02 §3):
//   GET  /users/me/profile        → { targetRole, experienceLevel }
//   PATCH /users/me/profile       → { targetRole, experienceLevel }
//   GET  /users/me/skill-profile  → { skills, skillGaps, updatedAt }
// All calls flow through the shared axios client (Bearer auto-attached).
import api from './api';

export const userService = {
  async getProfile() {
    const { data } = await api.get('/users/me/profile');
    return data;
  },

  async updateProfile(patch) {
    const { data } = await api.patch('/users/me/profile', patch);
    return data;
  },

  async getSkillProfile() {
    const { data } = await api.get('/users/me/skill-profile');
    return data;
  },
};
