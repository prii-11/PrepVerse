import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';
import { resumeService } from './resumeService';

describe('resumeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploads via multipart/form-data with the file field', async () => {
    const file = new File(['x'], 'resume.pdf', { type: 'application/pdf' });
    api.post.mockResolvedValue({ data: { _id: 'abc', status: 'ANALYZED' } });

    const result = await resumeService.uploadResume(file);

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe('/resumes');
    expect(body).toBeInstanceOf(FormData);
    expect(body.get('file')).toBe(file);
    expect(result.status).toBe('ANALYZED');
  });

  it('lists resumes', async () => {
    api.get.mockResolvedValue({ data: [{ _id: '1', status: 'ANALYZED' }] });
    const result = await resumeService.listResumes();
    expect(api.get).toHaveBeenCalledWith('/resumes');
    expect(result).toHaveLength(1);
  });

  it('fetches a single resume by id', async () => {
    api.get.mockResolvedValue({ data: { _id: 'abc' } });
    const result = await resumeService.getResume('abc');
    expect(api.get).toHaveBeenCalledWith('/resumes/abc');
    expect(result._id).toBe('abc');
  });

  it('fetches a signed download URL', async () => {
    api.get.mockResolvedValue({ data: { url: 'u', filename: 'f', expiresInSeconds: 900 } });
    const result = await resumeService.getDownloadUrl('abc');
    expect(api.get).toHaveBeenCalledWith('/resumes/abc/download');
    expect(result.expiresInSeconds).toBe(900);
  });

  it('deletes a resume', async () => {
    api.delete.mockResolvedValue({ status: 204 });
    await resumeService.deleteResume('abc');
    expect(api.delete).toHaveBeenCalledWith('/resumes/abc');
  });
});