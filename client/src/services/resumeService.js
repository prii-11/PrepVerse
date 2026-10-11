// Resume service — upload (multipart), list, detail, signed download URL,
// delete. Backend contract (docs/02 §3, M6):
//   POST   /resumes              → 201 full detail (multipart 'file' field)
//   GET    /resumes              → 200 [{ _id, status, originalFilename, createdAt }]
//   GET    /resumes/:id          → 200 full detail with analysis
//   GET    /resumes/:id/download → 200 { url, filename, expiresInSeconds }
//   DELETE /resumes/:id          → 204 (no body)
// Upload is the only multipart endpoint; all others are JSON.
import api from './api';

const SUPPORTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const MAX_SIZE = 5 * 1024 * 1024;

export const resumeService = {
  async listResumes() {
    const { data } = await api.get('/resumes');
    return data;
  },

  async getResume(id) {
    const { data } = await api.get(`/resumes/${id}`);
    return data;
  },

  // POST /resumes — multipart 'file' field (docs/06 §3, docs/17 §4.2).
  // Client-side guards reduce unnecessary upload traffic; the backend
  // upload middleware is the authoritative validator (magic-byte sniffing,
  // MIME allowlist, size cap).
  async uploadResume(file) {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      throw Object.assign(new Error('Unsupported file type'), { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      throw Object.assign(new Error('File too large'), { status: 400 });
    }

    const formData = new FormData();
    formData.append('file', file);

    const { data } = await api.post('/resumes', formData);
    return data;
  },

  // GET /:id/download → { url, filename, expiresInSeconds } (docs/06 §3.3).
  // The backend returns a signed short-lived URL from object storage.
  async getDownloadUrl(id) {
    const { data } = await api.get(`/resumes/${id}/download`);
    return data;
  },

  async deleteResume(id) {
    await api.delete(`/resumes/${id}`);
  },
};
