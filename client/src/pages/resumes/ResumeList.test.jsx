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

import ResumeList from './ResumeList';

const RESUMES = [
  { _id: 'a', status: 'ANALYZED', originalFilename: 'resume.pdf', createdAt: '2026-08-01T00:00:00.000Z' },
  { _id: 'b', status: 'FAILED', originalFilename: 'broken.docx', createdAt: '2026-08-02T00:00:00.000Z' },
];

describe('ResumeList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the populated list with statuses', async () => {
    listResumes.mockResolvedValue(RESUMES);
    render(<ResumeList onSelect={vi.fn()} />);

    expect(await screen.findByText('resume.pdf')).toBeInTheDocument();
    expect(screen.getByText('broken.docx')).toBeInTheDocument();
    expect(screen.getAllByText('ANALYZED')).toHaveLength(1);
    expect(screen.getAllByText('FAILED')).toHaveLength(1);
  });

  it('renders the empty state', async () => {
    listResumes.mockResolvedValue([]);
    render(<ResumeList onSelect={vi.fn()} />);

    expect(await screen.findByText(/no resumes yet/i)).toBeInTheDocument();
  });

  it('navigates to detail on select', async () => {
    listResumes.mockResolvedValue(RESUMES);
    const onSelect = vi.fn();
    const user = userEvent.setup();
    render(<ResumeList onSelect={onSelect} />);

    await user.click(await screen.findByTestId('resume-row-a'));

    expect(onSelect).toHaveBeenCalledWith('a');
  });

  it('shows an API error and recovers via retry', async () => {
    listResumes
      .mockRejectedValueOnce({ response: { data: { error: { message: 'Something broke' } } } })
      .mockResolvedValueOnce(RESUMES);
    const user = userEvent.setup();
    render(<ResumeList onSelect={vi.fn()} />);

    expect(await screen.findByText('Something broke')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Retry' }));

    await waitFor(() => expect(screen.getByText('resume.pdf')).toBeInTheDocument());
    expect(listResumes).toHaveBeenCalledTimes(2);
  });
});