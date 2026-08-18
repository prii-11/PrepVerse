import { act } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

import ResumeUploader from './ResumeUploader';

const ANALYZED_DETAIL = {
  _id: 'r1',
  originalFilename: 'resume.pdf',
  mimeType: 'application/pdf',
  size: 1024,
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

const FAILED_DETAIL = {
  _id: 'r2',
  originalFilename: 'broken.pdf',
  mimeType: 'application/pdf',
  size: 1024,
  status: 'FAILED',
  failureReason: 'AI_PROVIDER_FAILED',
  analysis: null,
};

function makeFile(name, size, type) {
  return new File([size > 0 ? new Uint8Array(size) : []], name, { type });
}

function createUploadEvent(file) {
  const event = new Event('change', { bubbles: true });
  Object.defineProperty(event, 'target', {
    value: { files: [file] },
    writable: true,
  });
  return event;
}

describe('ResumeUploader', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects an unsupported file type before any upload', async () => {
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('notes.txt', 1000, 'text/plain');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByTestId('upload-invalid')).toHaveTextContent('Unsupported file type — PDF and DOCX only');
    expect(uploadResume).not.toHaveBeenCalled();
  });

  it('rejects a file above 5MB before any upload', async () => {
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('resume.pdf', 5 * 1024 * 1024 + 1, 'application/pdf');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByTestId('upload-invalid')).toHaveTextContent('File too large — maximum 5MB');
    expect(uploadResume).not.toHaveBeenCalled();
  });

  it('uploads a valid PDF and renders the ANALYZED result', async () => {
    uploadResume.mockResolvedValue(ANALYZED_DETAIL);
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('resume.pdf', 1024, 'application/pdf');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(uploadResume).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('resume-status')).toHaveTextContent('ANALYZED');
    expect(await screen.findByText('JavaScript')).toBeInTheDocument();
    expect(await screen.findByText('PrepVerse')).toBeInTheDocument();
    expect(screen.queryByText('Resume Score')).not.toBeInTheDocument();
  });

  it('renders the FAILED state with the failureReason label', async () => {
    uploadResume.mockResolvedValue(FAILED_DETAIL);
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('broken.pdf', 1024, 'application/pdf');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByTestId('resume-failure')).toBeInTheDocument();
    expect(screen.getAllByTestId('resume-failure')).toHaveLength(1);
    expect(await screen.findByText(/analysis service was unavailable/i)).toBeInTheDocument();
    expect(screen.getAllByText(/analysis service was unavailable/i)).toHaveLength(1);
  });

  it('surfaces an API failure message from the error envelope', async () => {
    uploadResume.mockRejectedValue({
      response: { data: { error: { message: 'File too large — maximum 5MB' } } },
    });
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('resume.pdf', 1024, 'application/pdf');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByTestId('upload-error')).toHaveTextContent('File too large — maximum 5MB');
  });

  it('surfaces a network failure with the fallback message', async () => {
    uploadResume.mockRejectedValue(new Error('Network Error'));
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('resume.pdf', 1024, 'application/pdf');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByTestId('upload-error')).toHaveTextContent(/upload failed/i);
  });

  it('shows a loading state while uploading', async () => {
    let resolveUpload;
    uploadResume.mockReturnValue(new Promise((resolve) => { resolveUpload = resolve; }));
    render(<ResumeUploader />);
    const input = screen.getByTestId('resume-file-input');

    const file = makeFile('resume.pdf', 1024, 'application/pdf');
    await act(async () => {
      fireEvent.change(input, { target: { files: [file] } });
    });

    expect(await screen.findByText(/uploading and analyzing/i)).toBeInTheDocument();

    resolveUpload(ANALYZED_DETAIL);
    await waitFor(() => expect(screen.queryByText(/uploading and analyzing/i)).not.toBeInTheDocument());
  });
});
