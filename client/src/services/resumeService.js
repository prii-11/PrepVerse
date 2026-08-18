// Resume service — the only caller of the resumes endpoints (docs/02 §3,
// M4.2 + M6): upload (multipart), list, detail, signed download URL, delete.
// Upload is synchronous: the 201 response is already ANALYZED or FAILED.
import api from './api';

export const resumeService = {
  async uploadResume(file) {
    const formData = new FormData();
    formData.append('file', file);
    // No manual Content-Type: axios detects FormData in the browser, drops
    // the instance default, and lets the browser set multipart + boundary.
    const { data } = await api.post('/resumes', formData);
    return data; // full detail: ANALYZED (analysis) or FAILED (failureReason)
  },

  async listResumes() {
    const { data } = await api.get('/resumes');
    return data; // [{ _id, status, originalFilename, createdAt }]
  },

  async getResume(id) {
    const { data } = await api.get(`/resumes/${id}`);
    return data; // full detail
  },

  async getDownloadUrl(id) {
    const { data } = await api.get(`/resumes/${id}/download`);
    return data; // { url, filename, expiresInSeconds }
  },

  async deleteResume(id) {
    await api.delete(`/resumes/${id}`); // 204 — nothing to return
  },
};