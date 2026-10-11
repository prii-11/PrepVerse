import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resumeService } from './resumeService';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    delete: vi.fn(),
  },
}));

import api from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('resumeService', () => {
  const mockResume = {
    _id: '6650a1b2c3d4e5f6a7b8c9d0',
    originalFilename: 'resume.pdf',
    status: 'ANALYZED',
    createdAt: '2026-01-15T10:30:00.000Z',
    mimeType: 'application/pdf',
    size: 102400,
    analysis: { extractedSkills: ['JavaScript'], experienceSummary: 'test', projects: [], strengths: [], skillGaps: [] },
    failureReason: null,
    updatedAt: '2026-01-15T10:30:00.000Z',
  };

  describe('listResumes', () => {
    it('returns array from GET /resumes', async () => {
      const resumes = [mockResume];
      api.get.mockResolvedValue({ data: resumes });

      const result = await resumeService.listResumes();

      expect(api.get).toHaveBeenCalledWith('/resumes');
      expect(result).toEqual(resumes);
    });

    it('returns empty array when no resumes', async () => {
      api.get.mockResolvedValue({ data: [] });

      const result = await resumeService.listResumes();

      expect(result).toEqual([]);
    });
  });

  describe('getResume', () => {
    it('returns full detail from GET /resumes/:id', async () => {
      api.get.mockResolvedValue({ data: mockResume });

      const result = await resumeService.getResume(mockResume._id);

      expect(api.get).toHaveBeenCalledWith(`/resumes/${mockResume._id}`);
      expect(result).toEqual(mockResume);
    });

    it('propagates 404 error', async () => {
      const error = { response: { status: 404, data: { error: { message: 'Resume not found' } } } };
      api.get.mockRejectedValue(error);

      await expect(resumeService.getResume('nonexistent')).rejects.toEqual(error);
    });
  });

  describe('uploadResume', () => {
    it('sends FormData with field name "file" to POST /resumes', async () => {
      const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
      api.post.mockResolvedValue({ data: mockResume });

      const result = await resumeService.uploadResume(file);

      expect(api.post).toHaveBeenCalledTimes(1);
      const [url, formData] = api.post.mock.calls[0];
      expect(url).toBe('/resumes');
      expect(formData).toBeInstanceOf(FormData);
      expect(formData.get('file')).toBe(file);
      expect(result).toEqual(mockResume);
    });

    it('sends DOCX files correctly', async () => {
      const file = new File(['content'], 'resume.docx', {
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });
      api.post.mockResolvedValue({ data: mockResume });

      await resumeService.uploadResume(file);

      const [, formData] = api.post.mock.calls[0];
      expect(formData.get('file')).toBe(file);
    });

    it('rejects unsupported file types before API call', async () => {
      const file = new File(['content'], 'resume.txt', { type: 'text/plain' });

      await expect(resumeService.uploadResume(file)).rejects.toThrow('Unsupported file type');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('rejects files over 5MB before API call', async () => {
      const bigContent = new Uint8Array(5 * 1024 * 1024 + 1);
      const file = new File([bigContent], 'big.pdf', { type: 'application/pdf' });

      await expect(resumeService.uploadResume(file)).rejects.toThrow('File too large');
      expect(api.post).not.toHaveBeenCalled();
    });

    it('propagates API errors from upload', async () => {
      const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
      const error = { response: { status: 500, data: { error: { message: 'Server error' } } } };
      api.post.mockRejectedValue(error);

      await expect(resumeService.uploadResume(file)).rejects.toEqual(error);
    });
  });

  describe('getDownloadUrl', () => {
    it('returns signed URL from GET /resumes/:id/download', async () => {
      const downloadData = {
        url: 'https://signed-url.example.com/file.pdf',
        filename: 'resume.pdf',
        expiresInSeconds: 900,
      };
      api.get.mockResolvedValue({ data: downloadData });

      const result = await resumeService.getDownloadUrl(mockResume._id);

      expect(api.get).toHaveBeenCalledWith(`/resumes/${mockResume._id}/download`);
      expect(result).toEqual(downloadData);
    });

    it('preserves filename and expiration from backend', async () => {
      const downloadData = {
        url: 'https://signed-url.example.com/file.pdf',
        filename: 'my-resume.pdf',
        expiresInSeconds: 600,
      };
      api.get.mockResolvedValue({ data: downloadData });

      const result = await resumeService.getDownloadUrl('id123');

      expect(result.filename).toBe('my-resume.pdf');
      expect(result.expiresInSeconds).toBe(600);
    });

    it('propagates 404 error for missing resume', async () => {
      const error = { response: { status: 404 } };
      api.get.mockRejectedValue(error);

      await expect(resumeService.getDownloadUrl('nonexistent')).rejects.toEqual(error);
    });
  });

  describe('deleteResume', () => {
    it('calls DELETE /resumes/:id', async () => {
      api.delete.mockResolvedValue({});

      await resumeService.deleteResume(mockResume._id);

      expect(api.delete).toHaveBeenCalledWith(`/resumes/${mockResume._id}`);
    });

    it('propagates 404 error', async () => {
      const error = { response: { status: 404 } };
      api.delete.mockRejectedValue(error);

      await expect(resumeService.deleteResume('nonexistent')).rejects.toEqual(error);
    });
  });

  describe('endpoint construction', () => {
    it('uses correct endpoint paths', async () => {
      api.get.mockResolvedValue({ data: [] });
      api.post.mockResolvedValue({ data: {} });
      api.delete.mockResolvedValue({});

      await resumeService.listResumes();
      await resumeService.getResume('abc123');
      await resumeService.getDownloadUrl('abc123');
      await resumeService.deleteResume('abc123');

      expect(api.get).toHaveBeenCalledWith('/resumes');
      expect(api.get).toHaveBeenCalledWith('/resumes/abc123');
      expect(api.get).toHaveBeenCalledWith('/resumes/abc123/download');
      expect(api.delete).toHaveBeenCalledWith('/resumes/abc123');
    });
  });
});
