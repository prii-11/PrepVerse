import { describe, it, expect, vi, beforeEach } from 'vitest';
import { analyticsService } from './analyticsService';

vi.mock('./api', () => ({
  default: {
    get: vi.fn(),
  },
}));

import api from './api';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('analyticsService', () => {
  const mockReadiness = {
    score: 64.6,
    breakdown: {
      technical: 68,
      communication: 79,
      skillCoverage: 50.9,
      consistency: 50,
      improvementTrend: 58,
    },
    interviewCount: 2,
  };

  const mockProgress = {
    points: [
      { interviewId: 'abc123', completedAt: '2026-01-10T10:00:00.000Z', overallScore: 62 },
      { interviewId: 'def456', completedAt: '2026-01-15T10:00:00.000Z', overallScore: 71 },
    ],
  };

  const mockPracticePlan = {
    targetRole: 'Backend Developer',
    skillGaps: [
      { skillKey: 'sql', requiredMinimumLevel: 'INTERMEDIATE', currentLevel: null, reason: 'missing' },
      { skillKey: 'testing', requiredMinimumLevel: 'BEGINNER', currentLevel: null, reason: 'missing' },
    ],
  };

  describe('getReadiness', () => {
    it('returns readiness from GET /analytics/readiness', async () => {
      api.get.mockResolvedValue({ data: mockReadiness });

      const result = await analyticsService.getReadiness();

      expect(api.get).toHaveBeenCalledWith('/analytics/readiness');
      expect(result).toEqual(mockReadiness);
    });

    it('includes score, breakdown, and interviewCount', async () => {
      api.get.mockResolvedValue({ data: mockReadiness });

      const result = await analyticsService.getReadiness();

      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('breakdown');
      expect(result).toHaveProperty('interviewCount');
      expect(result.breakdown).toHaveProperty('technical');
      expect(result.breakdown).toHaveProperty('communication');
      expect(result.breakdown).toHaveProperty('skillCoverage');
      expect(result.breakdown).toHaveProperty('consistency');
      expect(result.breakdown).toHaveProperty('improvementTrend');
    });

    it('handles null score (zero interviews)', async () => {
      const empty = { score: null, breakdown: { technical: null, communication: null, skillCoverage: null, consistency: null, improvementTrend: null }, interviewCount: 0 };
      api.get.mockResolvedValue({ data: empty });

      const result = await analyticsService.getReadiness();

      expect(result.score).toBeNull();
      expect(result.interviewCount).toBe(0);
    });

    it('propagates API errors', async () => {
      const error = { response: { status: 500 } };
      api.get.mockRejectedValue(error);

      await expect(analyticsService.getReadiness()).rejects.toEqual(error);
    });
  });

  describe('getProgress', () => {
    it('returns progress from GET /analytics/progress', async () => {
      api.get.mockResolvedValue({ data: mockProgress });

      const result = await analyticsService.getProgress();

      expect(api.get).toHaveBeenCalledWith('/analytics/progress');
      expect(result).toEqual(mockProgress);
    });

    it('returns points array with interviewId, completedAt, overallScore', async () => {
      api.get.mockResolvedValue({ data: mockProgress });

      const result = await analyticsService.getProgress();

      expect(result.points).toHaveLength(2);
      expect(result.points[0]).toHaveProperty('interviewId');
      expect(result.points[0]).toHaveProperty('completedAt');
      expect(result.points[0]).toHaveProperty('overallScore');
    });

    it('handles empty points (no completed interviews)', async () => {
      api.get.mockResolvedValue({ data: { points: [] } });

      const result = await analyticsService.getProgress();

      expect(result.points).toEqual([]);
    });

    it('propagates API errors', async () => {
      const error = { response: { status: 500 } };
      api.get.mockRejectedValue(error);

      await expect(analyticsService.getProgress()).rejects.toEqual(error);
    });
  });

  describe('getPracticePlan', () => {
    it('returns practice plan from GET /analytics/practice-plan', async () => {
      api.get.mockResolvedValue({ data: mockPracticePlan });

      const result = await analyticsService.getPracticePlan();

      expect(api.get).toHaveBeenCalledWith('/analytics/practice-plan');
      expect(result).toEqual(mockPracticePlan);
    });

    it('returns targetRole and skillGaps', async () => {
      api.get.mockResolvedValue({ data: mockPracticePlan });

      const result = await analyticsService.getPracticePlan();

      expect(result).toHaveProperty('targetRole');
      expect(result).toHaveProperty('skillGaps');
      expect(Array.isArray(result.skillGaps)).toBe(true);
    });

    it('skill gaps have required fields', async () => {
      api.get.mockResolvedValue({ data: mockPracticePlan });

      const result = await analyticsService.getPracticePlan();

      for (const gap of result.skillGaps) {
        expect(gap).toHaveProperty('skillKey');
        expect(gap).toHaveProperty('requiredMinimumLevel');
        expect(gap).toHaveProperty('currentLevel');
        expect(gap).toHaveProperty('reason');
        expect(['missing', 'unassessed', 'under-level']).toContain(gap.reason);
      }
    });

    it('handles no target role', async () => {
      const noRole = { targetRole: null, skillGaps: [] };
      api.get.mockResolvedValue({ data: noRole });

      const result = await analyticsService.getPracticePlan();

      expect(result.targetRole).toBeNull();
      expect(result.skillGaps).toEqual([]);
    });

    it('propagates API errors', async () => {
      const error = { response: { status: 500 } };
      api.get.mockRejectedValue(error);

      await expect(analyticsService.getPracticePlan()).rejects.toEqual(error);
    });
  });

  describe('endpoint construction', () => {
    it('uses correct endpoint paths', async () => {
      api.get.mockResolvedValue({ data: {} });

      await analyticsService.getReadiness();
      await analyticsService.getProgress();
      await analyticsService.getPracticePlan();

      expect(api.get).toHaveBeenCalledWith('/analytics/readiness');
      expect(api.get).toHaveBeenCalledWith('/analytics/progress');
      expect(api.get).toHaveBeenCalledWith('/analytics/practice-plan');
    });
  });
});
