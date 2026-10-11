import { describe, it, expect, vi, beforeEach } from 'vitest';
import { interviewService } from './interviewService';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

import api from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

const mockInterview = {
  _id: '6650a1b2c3d4e5f6a7b8c9d0',
  targetRole: 'Backend Developer',
  difficulty: 'medium',
  status: 'CREATED',
  questionGeneration: { status: 'COMPLETED' },
  questions: [
    {
      _id: '6650a1b2c3d4e5f6a7b8c9d1',
      text: 'Explain REST',
      category: 'Technical',
      difficulty: 'medium',
      expectedTopics: [{ skillKey: 'rest-apis', topic: 'REST basics' }],
    },
  ],
  answers: [],
  createdAt: '2026-01-15T10:30:00.000Z',
};

const mockCompletedInterview = {
  ...mockInterview,
  status: 'COMPLETED',
  completedAt: '2026-01-15T11:00:00.000Z',
  answers: [
    {
      _id: '6650a1b2c3d4e5f6a7b8c9e0',
      questionId: '6650a1b2c3d4e5f6a7b8c9d1',
      text: 'REST is an architectural style...',
      evaluationStatus: 'COMPLETED',
      evaluation: {
        correctness: 80,
        technicalDepth: 70,
        communication: 85,
        strengths: ['Good structure'],
        weaknesses: ['Missing examples'],
        improvementTip: 'Add concrete examples',
      },
      evaluatedAt: '2026-01-15T11:00:00.000Z',
    },
  ],
  report: {
    overallScore: 78,
    technicalScore: 76,
    communicationScore: 85,
    strengths: ['Good structure'],
    weaknesses: ['Missing examples'],
    recommendations: ['Add concrete examples'],
    generatedAt: '2026-01-15T11:00:00.000Z',
    profileSyncStatus: 'COMPLETED',
  },
};

describe('interviewService', () => {
  describe('listInterviews', () => {
    it('returns array from GET /interviews', async () => {
      const interviews = [{ _id: 'abc', status: 'COMPLETED', targetRole: 'Backend Developer' }];
      api.get.mockResolvedValue({ data: interviews });

      const result = await interviewService.listInterviews();

      expect(api.get).toHaveBeenCalledWith('/interviews');
      expect(result).toEqual(interviews);
    });
  });

  describe('getInterview', () => {
    it('returns full detail from GET /interviews/:id', async () => {
      api.get.mockResolvedValue({ data: mockInterview });

      const result = await interviewService.getInterview(mockInterview._id);

      expect(api.get).toHaveBeenCalledWith(`/interviews/${mockInterview._id}`);
      expect(result).toEqual(mockInterview);
    });

    it('propagates 404 error', async () => {
      const error = { response: { status: 404 } };
      api.get.mockRejectedValue(error);

      await expect(interviewService.getInterview('nonexistent')).rejects.toEqual(error);
    });
  });

  describe('createInterview', () => {
    it('sends POST /interviews with lowercased difficulty', async () => {
      api.post.mockResolvedValue({ data: mockInterview });

      const result = await interviewService.createInterview({
        targetRole: 'Backend Developer',
        difficulty: 'Medium',
        questionCount: 4,
      });

      expect(api.post).toHaveBeenCalledWith('/interviews', {
        targetRole: 'Backend Developer',
        difficulty: 'medium',
        questionCount: 4,
      });
      expect(result).toEqual(mockInterview);
    });

    it('lowercases difficulty from any casing', async () => {
      api.post.mockResolvedValue({ data: mockInterview });

      await interviewService.createInterview({
        targetRole: 'Backend Developer',
        difficulty: 'HARD',
        questionCount: 3,
      });

      expect(api.post).toHaveBeenCalledWith('/interviews', expect.objectContaining({
        difficulty: 'hard',
      }));
    });

    it('defaults questionCount to 4', async () => {
      api.post.mockResolvedValue({ data: mockInterview });

      await interviewService.createInterview({
        targetRole: 'Backend Developer',
        difficulty: 'easy',
      });

      expect(api.post).toHaveBeenCalledWith('/interviews', expect.objectContaining({
        questionCount: 4,
      }));
    });

    it('propagates API errors', async () => {
      const error = { response: { status: 400, data: { error: { message: 'Invalid role' } } } };
      api.post.mockRejectedValue(error);

      await expect(interviewService.createInterview({
        targetRole: 'Invalid',
        difficulty: 'medium',
      })).rejects.toEqual(error);
    });
  });

  describe('startInterview', () => {
    it('sends POST /interviews/:id/start', async () => {
      const startResponse = { _id: mockInterview._id, status: 'IN_PROGRESS', startedAt: new Date().toISOString() };
      api.post.mockResolvedValue({ data: startResponse });

      const result = await interviewService.startInterview(mockInterview._id);

      expect(api.post).toHaveBeenCalledWith(`/interviews/${mockInterview._id}/start`);
      expect(result).toEqual(startResponse);
    });

    it('propagates 409 on already started', async () => {
      const error = { response: { status: 409, data: { error: { code: 'INTERVIEW_ALREADY_STARTED' } } } };
      api.post.mockRejectedValue(error);

      await expect(interviewService.startInterview('id123')).rejects.toEqual(error);
    });
  });

  describe('addAnswer', () => {
    it('sends POST /interviews/:id/answers with questionId and text', async () => {
      const answerResponse = {
        _id: 'ans123',
        questionId: '6650a1b2c3d4e5f6a7b8c9d1',
        text: 'My answer',
        evaluationStatus: 'PENDING',
      };
      api.post.mockResolvedValue({ data: answerResponse });

      const result = await interviewService.addAnswer(mockInterview._id, {
        questionId: '6650a1b2c3d4e5f6a7b8c9d1',
        text: 'My answer',
      });

      expect(api.post).toHaveBeenCalledWith(`/interviews/${mockInterview._id}/answers`, {
        questionId: '6650a1b2c3d4e5f6a7b8c9d1',
        text: 'My answer',
      });
      expect(result).toEqual(answerResponse);
    });

    it('sends blank text without rejection', async () => {
      const answerResponse = { _id: 'ans456', questionId: 'q1', text: '', evaluationStatus: 'PENDING' };
      api.post.mockResolvedValue({ data: answerResponse });

      const result = await interviewService.addAnswer('id123', { questionId: 'q1', text: '' });

      expect(api.post).toHaveBeenCalledWith('/interviews/id123/answers', { questionId: 'q1', text: '' });
      expect(result.text).toBe('');
    });

    it('propagates 409 when interview not in progress', async () => {
      const error = { response: { status: 409, data: { error: { code: 'INTERVIEW_NOT_IN_PROGRESS' } } } };
      api.post.mockRejectedValue(error);

      await expect(interviewService.addAnswer('id123', { questionId: 'q1', text: 'answer' })).rejects.toEqual(error);
    });
  });

  describe('submitInterview', () => {
    it('sends POST /interviews/:id/submit and constructs questionResults', async () => {
      api.post.mockResolvedValue({ data: mockCompletedInterview });

      const result = await interviewService.submitInterview(mockInterview._id);

      expect(api.post).toHaveBeenCalledWith(`/interviews/${mockInterview._id}/submit`);
      expect(result.status).toBe('COMPLETED');
      expect(result.report.overallScore).toBe(78);
      expect(result.report.questionResults).toHaveLength(1);
      expect(result.report.questionResults[0].text).toBe('Explain REST');
      expect(result.report.questionResults[0].technicalScore).toBe(76); // 0.6*80 + 0.4*70
      expect(result.report.questionResults[0].communicationScore).toBe(85);
    });

    it('propagates 409 on zero answers', async () => {
      const error = { response: { status: 409, data: { error: { message: 'No answers to evaluate' } } } };
      api.post.mockRejectedValue(error);

      await expect(interviewService.submitInterview('id123')).rejects.toEqual(error);
    });

    it('propagates 409 when not in progress', async () => {
      const error = { response: { status: 409, data: { error: { code: 'INTERVIEW_NOT_IN_PROGRESS' } } } };
      api.post.mockRejectedValue(error);

      await expect(interviewService.submitInterview('id123')).rejects.toEqual(error);
    });
  });

  describe('cancelInterview', () => {
    it('sends POST /interviews/:id/cancel', async () => {
      const cancelResponse = { _id: mockInterview._id, status: 'CANCELLED' };
      api.post.mockResolvedValue({ data: cancelResponse });

      const result = await interviewService.cancelInterview(mockInterview._id);

      expect(api.post).toHaveBeenCalledWith(`/interviews/${mockInterview._id}/cancel`);
      expect(result).toEqual(cancelResponse);
    });

    it('propagates 409 when not cancellable', async () => {
      const error = { response: { status: 409, data: { error: { code: 'INTERVIEW_NOT_CANCELLABLE' } } } };
      api.post.mockRejectedValue(error);

      await expect(interviewService.cancelInterview('id123')).rejects.toEqual(error);
    });
  });

  describe('getReport', () => {
    it('sends GET /interviews/:id/report', async () => {
      const report = { overallScore: 85, strengths: [], weaknesses: [], recommendations: [] };
      api.get.mockResolvedValue({ data: report });

      const result = await interviewService.getReport('id123');

      expect(api.get).toHaveBeenCalledWith('/interviews/id123/report');
      expect(result).toEqual(report);
    });

    it('propagates 404 when report not available', async () => {
      const error = { response: { status: 404 } };
      api.get.mockRejectedValue(error);

      await expect(interviewService.getReport('id123')).rejects.toEqual(error);
    });
  });

  describe('endpoint construction', () => {
    it('uses correct endpoint paths', async () => {
      api.get.mockResolvedValue({ data: [] });
      api.post.mockResolvedValue({ data: {} });

      await interviewService.createInterview({ targetRole: 'Backend Developer', difficulty: 'Medium' });
      await interviewService.listInterviews();
      await interviewService.getInterview('abc');
      await interviewService.startInterview('abc');
      await interviewService.addAnswer('abc', { questionId: 'q1', text: 't' });
      await interviewService.submitInterview('abc');
      await interviewService.cancelInterview('abc');
      await interviewService.getReport('abc');

      expect(api.post).toHaveBeenCalledWith('/interviews', expect.objectContaining({ targetRole: 'Backend Developer', difficulty: 'medium' }));
      expect(api.get).toHaveBeenCalledWith('/interviews');
      expect(api.get).toHaveBeenCalledWith('/interviews/abc');
      expect(api.get).toHaveBeenCalledWith('/interviews/abc/report');
      expect(api.post).toHaveBeenCalledWith('/interviews/abc/start');
      expect(api.post).toHaveBeenCalledWith('/interviews/abc/answers', expect.anything());
      expect(api.post).toHaveBeenCalledWith('/interviews/abc/submit');
      expect(api.post).toHaveBeenCalledWith('/interviews/abc/cancel');
    });
  });

  describe('questionResults construction', () => {
    it('joins questions and answers by questionId', async () => {
      api.post.mockResolvedValue({ data: mockCompletedInterview });

      const result = await interviewService.submitInterview('id123');
      const qr = result.report.questionResults[0];

      expect(qr.text).toBe('Explain REST');
      expect(qr.category).toBe('Technical');
      expect(qr.strengths).toEqual(['Good structure']);
      expect(qr.weaknesses).toEqual(['Missing examples']);
    });

    it('handles missing question gracefully', async () => {
      const interview = {
        ...mockCompletedInterview,
        questions: [],
        answers: [{
          _id: 'a1',
          questionId: '6650a1b2c3d4e5f6a7b8c9d1',
          text: 'answer',
          evaluationStatus: 'COMPLETED',
          evaluation: { correctness: 50, technicalDepth: 50, communication: 50, strengths: [], weaknesses: [], improvementTip: '' },
        }],
      };
      api.post.mockResolvedValue({ data: interview });

      const result = await interviewService.submitInterview('id123');

      expect(result.report.questionResults[0].text).toBe('');
    });

    it('filters out non-COMPLETED answers', async () => {
      const interview = {
        ...mockCompletedInterview,
        answers: [
          { ...mockCompletedInterview.answers[0], evaluationStatus: 'PENDING', evaluation: null },
        ],
      };
      api.post.mockResolvedValue({ data: interview });

      const result = await interviewService.submitInterview('id123');

      expect(result.report.questionResults).toHaveLength(0);
    });

    it('computes technicalScore as weighted average', async () => {
      api.post.mockResolvedValue({ data: mockCompletedInterview });

      const result = await interviewService.submitInterview('id123');
      // correctness=80, technicalDepth=70 → 0.6*80 + 0.4*70 = 48+28 = 76
      expect(result.report.questionResults[0].technicalScore).toBe(76);
    });
  });
});
