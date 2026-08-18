import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const { uploadResume, listResumes, getResume, getDownloadUrl, deleteResume } = vi.hoisted(() => ({
  uploadResume: vi.fn(),
  listResumes: vi.fn(),
  getResume: vi.fn(),
  getDownloadUrl: vi.fn(),
  deleteResume: vi.fn(),
}));

vi.mock('../../services/resumeService', () => ({
  resumeService: {
    uploadResume,
    listResumes,
    getResume,
    getDownloadUrl,
    deleteResume,
  },
}));

import ResumeDetail from './ResumeDetail';

const ANALYZED = {
  _id: 'r1',
  originalFilename: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 2048,
  status: 'ANALYZED',
  failureReason: null,
  analysis: {
    extractedSkills: ['JavaScript', 'MongoDB'],
    experienceSummary: '3 years of full-stack work.',
    projects: [{ name: 'PrepVerse', description: 'AI mock interviews', technologies: ['React'] }],
    strengths: ['Clarity'],
    skillGaps: ['System Design'],
  },
};

const FAILED = {
  _id: 'r2',
  originalFilename: 'broken.pdf',
  mimeType: 'application/pdf',
  size: 2048,
  status: 'FAILED',
  failureReason: 'SCHEMA_VALIDATION_FAILED',
  analysis: null,
};

describe('ResumeDetail', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it('fetches and renders an ANALYZED resume detail', async () => {
    getResume.mockResolvedValue(ANALYZED);
    render(<ResumeDetail resumeId="r1" />);

    expect(await screen.findByTestId('resume-status')).toHaveTextContent('ANALYZED');
    expect(await screen.findByText('JavaScript')).toBeInTheDocument();
    expect(screen.getByText('MongoDB')).toBeInTheDocument();
    expect(screen.getByText(/3 years of full-stack work/)).toBeInTheDocument();
    expect(screen.getByText('PrepVerse')).toBeInTheDocument();
    expect(screen.getByText('Clarity')).toBeInTheDocument();
    expect(screen.getByText('System Design')).toBeInTheDocument();
    expect(getResume).toHaveBeenCalledWith('r1');
  });

  it('renders a FAILED resume with the failureReason label', async () => {
    getResume.mockResolvedValue(FAILED);
    render(<ResumeDetail resumeId="r2" />);

    expect(await screen.findByTestId('resume-status')).toHaveTextContent('FAILED');
    expect(await screen.findByTestId('resume-failure')).toHaveTextContent(/invalid result/i);
  });

  it('renders an upload-result resume without refetching', () => {
    render(<ResumeDetail resume={ANALYZED} />);

    expect(screen.getByTestId('resume-status')).toHaveTextContent('ANALYZED');
    expect(getResume).not.toHaveBeenCalled();
  });

  it('shows an API failure with retry', async () => {
    getResume
      .mockRejectedValueOnce({ response: { data: { error: { message: 'Not found' } } } })
      .mockResolvedValueOnce(ANALYZED);
    const user = userEvent.setup();
    render(<ResumeDetail resumeId="r1" />);

    expect(await screen.findByText('Not found')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByTestId('resume-status')).toHaveTextContent('ANALYZED'));
    expect(getResume).toHaveBeenCalledTimes(2);
  });

  it('downloads via the server-issued signed URL', async () => {
    getResume.mockResolvedValue(ANALYZED);
    getDownloadUrl.mockResolvedValue({
      url: 'https://signed.example/private/url',
      filename: 'resume.pdf',
      expiresInSeconds: 900,
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const user = userEvent.setup();
    render(<ResumeDetail resumeId="r1" />);

    await user.click(await screen.findByRole('button', { name: 'Download' }));

    await waitFor(() => {
      expect(open).toHaveBeenCalledWith('https://signed.example/private/url', '_blank', 'noopener,noreferrer');
    });
    expect(await screen.findByText(/link valid for 15 minutes/i)).toBeInTheDocument();
  });

  it('surfaces a download failure', async () => {
    getResume.mockResolvedValue(ANALYZED);
    getDownloadUrl.mockRejectedValue({ response: { data: { error: { message: 'Gone' } } } });
    const user = userEvent.setup();
    render(<ResumeDetail resumeId="r1" />);

    await user.click(await screen.findByRole('button', { name: 'Download' }));

    expect(await screen.findByText('Gone')).toBeInTheDocument();
  });

  it('deletes only after the 204 resolves, then calls onDelete', async () => {
    getResume.mockResolvedValue(ANALYZED);
    deleteResume.mockResolvedValue({ status: 204 });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<ResumeDetail resumeId="r1" onDelete={onDelete} />);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(deleteResume).toHaveBeenCalledWith('r1');
  });

  it('does not delete when the user cancels the confirmation', async () => {
    getResume.mockResolvedValue(ANALYZED);
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const user = userEvent.setup();
    render(<ResumeDetail resumeId="r1" />);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(deleteResume).not.toHaveBeenCalled();
  });

  it('shows a delete failure without removing the resume', async () => {
    getResume.mockResolvedValue(ANALYZED);
    deleteResume.mockRejectedValue({ response: { data: { error: { message: 'Boom' } } } });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onDelete = vi.fn();
    const user = userEvent.setup();
    render(<ResumeDetail resumeId="r1" onDelete={onDelete} />);

    await user.click(await screen.findByRole('button', { name: 'Delete' }));

    expect(await screen.findByText('Boom')).toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByTestId('resume-status')).toHaveTextContent('ANALYZED');
  });

  it('does not render an invented numeric score', async () => {
    getResume.mockResolvedValue(ANALYZED);
    render(<ResumeDetail resumeId="r1" />);

    await screen.findByTestId('resume-status');
    expect(screen.queryByText(/score/i)).not.toBeInTheDocument();
  });
});