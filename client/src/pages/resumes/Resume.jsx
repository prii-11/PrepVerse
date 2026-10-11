// Resume — upload + resume list. ANALYZED rows offer View Analysis / Download;
// FAILED rows surface the backend failure reason with Retry / Delete.
// There is deliberately NO resume score — the domain does not define one.
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import PageHeader from '../../components/layout/PageHeader';
import Button, { buttonClass } from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import EmptyState from '../../components/ui/EmptyState';
import Spinner from '../../components/ui/Spinner';
import { resumeService } from '../../services';
import { FAILURE_REASON_LABELS, resumeAnalysisPath } from '../../utils/constants';
import { formatDate, getErrorMessage } from '../../utils/helpers';

const SUPPORTED_HINT = 'PDF or DOCX · up to 5MB';

export default function Resume() {
  const fileInputRef = useRef(null);
  const [resumes, setResumes] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [busyId, setBusyId] = useState(null);

  const refresh = () =>
    resumeService
      .listResumes()
      .then(setResumes)
      .catch(() => setResumes([]));

  useEffect(() => {
    refresh();
  }, []);

  const onFileChosen = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploadError(null);
    setUploading(true);
    try {
      await resumeService.uploadResume(file);
      await refresh();
    } catch (cause) {
      setUploadError(getErrorMessage(cause, 'Upload failed. Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const download = async (id) => {
    setBusyId(id);
    try {
      await resumeService.getDownloadUrl(id); // signed URL (15-min expiry) — mock no-op
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (id) => {
    setBusyId(id);
    try {
      await resumeService.deleteResume(id);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="animate-rise">
      <PageHeader
        title="Resume"
        description="Upload your resume to ground your interviews in your actual experience."
        action={
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf"
              className="hidden"
              onChange={onFileChosen}
            />
            <Button size="lg" loading={uploading} onClick={() => fileInputRef.current?.click()}>
              {uploading ? 'Uploading…' : 'Upload Resume'}
            </Button>
          </>
        }
      />

      <p className="-mt-4 mb-6 text-xs text-faint">{SUPPORTED_HINT}</p>

      {uploading ? (
        <div className="mb-6 flex items-center gap-3 rounded-2xl border border-line bg-paper px-5 py-4 shadow-card">
          <Spinner className="size-5 text-brand" />
          <div>
            <p className="text-sm font-medium text-ink">Analyzing your resume</p>
            <p className="text-xs text-muted">Extracting skills and experience. This takes a moment.</p>
          </div>
        </div>
      ) : null}

      {uploadError ? (
        <p
          role="alert"
          className="mb-6 rounded-xl border border-danger/25 bg-danger-soft px-4 py-3 text-sm text-danger"
        >
          {uploadError}
        </p>
      ) : null}

      {!resumes ? (
        <div className="flex justify-center py-24">
          <Spinner className="size-6 text-sage" />
        </div>
      ) : resumes.length === 0 ? (
        <EmptyState
          title="No resumes yet"
          description="Upload a PDF or DOCX resume to see your extracted skills, strengths, and gaps."
          action={<Button onClick={() => fileInputRef.current?.click()}>Upload Resume</Button>}
        />
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-paper shadow-card">
          {resumes.map((resume) => (
            <li key={resume._id} className="p-5">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium text-ink">{resume.originalFilename}</p>
                  <p className="mt-0.5 text-sm text-muted">{formatDate(resume.createdAt)}</p>
                </div>
                <StatusBadge status={resume.status} />
                {resume.status === 'ANALYZED' ? (
                  <div className="flex items-center gap-2">
                    <Link to={resumeAnalysisPath(resume._id)} className={buttonClass('secondary', 'sm')}>
                      View Analysis
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={busyId === resume._id}
                      onClick={() => download(resume._id)}
                    >
                      Download
                    </Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
                      Retry
                    </Button>
                    <Button
                      variant="danger-ghost"
                      size="sm"
                      loading={busyId === resume._id}
                      onClick={() => remove(resume._id)}
                    >
                      Delete
                    </Button>
                  </div>
                )}
              </div>
              {resume.status === 'FAILED' ? (
                <p className="mt-3 rounded-xl bg-danger-soft px-4 py-2.5 text-sm leading-relaxed text-danger">
                  {FAILURE_REASON_LABELS[resume.failureReason] ||
                    'This file could not be analyzed. Try uploading it again.'}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
