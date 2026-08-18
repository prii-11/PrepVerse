// Resume detail — full backend detail (GET /resumes/:id). Renders only
// fields the backend actually returns. ANALYZED → analysis fields
// (extractedSkills, experienceSummary, projects, strengths, skillGaps);
// FAILED → failureReason. No numeric score exists in the contract and none
// is computed. Download uses the server-issued signed URL, fetched fresh on
// each request; delete waits for the 204 before updating the UI.
//
// Usage:
//   <ResumeDetail resumeId="..." onBack onDelete>  — fetches by id (analysis page)
//   <ResumeDetail resume={detail} onDelete>        — renders a 201 upload result
import { useEffect, useState } from 'react';
import Button from '../../components/common/Button';
import Loader from '../../components/common/Loader';
import { resumeService } from '../../services/resumeService';
import { FAILURE_REASON_LABELS } from '../../utils/constants';
import { getErrorMessage } from '../../utils/helpers';

function Section({ title, children }) {
  return (
    <div>
      <p className="text-sm text-[#6B7280]">{title}</p>
      <div className="mt-2 text-sm text-[#1F2937]">{children}</div>
    </div>
  );
}

function Analysis({ analysis }) {
  if (!analysis || typeof analysis !== 'object') {
    return <p className="text-sm text-[#6B7280]">No analysis available for this resume.</p>;
  }

  const hasContent =
    (Array.isArray(analysis.extractedSkills) && analysis.extractedSkills.length > 0) ||
    Boolean(analysis.experienceSummary) ||
    (Array.isArray(analysis.projects) && analysis.projects.length > 0) ||
    (Array.isArray(analysis.strengths) && analysis.strengths.length > 0) ||
    (Array.isArray(analysis.skillGaps) && analysis.skillGaps.length > 0);

  if (!hasContent) {
    return <p className="text-sm text-[#6B7280]">Analysis completed with no extractable details.</p>;
  }

  return (
    <div className="space-y-4">
      {Array.isArray(analysis.extractedSkills) && analysis.extractedSkills.length > 0 ? (
        <Section title="Extracted Skills">
          <div className="flex flex-wrap gap-2">
            {analysis.extractedSkills.map((skill) => (
              <span key={skill} className="rounded-full border border-[#E5E7EB] bg-[#F8F9F5] px-3 py-1 text-xs">{skill}</span>
            ))}
          </div>
        </Section>
      ) : null}
      {analysis.experienceSummary ? (
        <Section title="Experience Summary">{analysis.experienceSummary}</Section>
      ) : null}
      {Array.isArray(analysis.projects) && analysis.projects.length > 0 ? (
        <Section title="Projects">
          <ul className="space-y-2">
            {analysis.projects.map((project, index) => (
              <li key={`${project.name}-${index}`} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">
                <p className="font-medium">{project.name}</p>
                {project.description ? <p className="mt-1 text-[#6B7280]">{project.description}</p> : null}
                {Array.isArray(project.technologies) && project.technologies.length > 0 ? (
                  <p className="mt-1 text-xs text-[#6B7280]">{project.technologies.join(', ')}</p>
                ) : null}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {Array.isArray(analysis.strengths) && analysis.strengths.length > 0 ? (
        <Section title="Strengths">
          <ul className="space-y-2">
            {analysis.strengths.map((strength) => (
              <li key={strength} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">{strength}</li>
            ))}
          </ul>
        </Section>
      ) : null}
      {Array.isArray(analysis.skillGaps) && analysis.skillGaps.length > 0 ? (
        <Section title="Skill Gaps">
          <ul className="space-y-2">
            {analysis.skillGaps.map((gap) => (
              <li key={gap} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">{gap}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}

export default function ResumeDetail({ resume: initialResume, resumeId, onBack, onDelete }) {
  const [resume, setResume] = useState(initialResume ?? null);
  const [loading, setLoading] = useState(Boolean(resumeId) && !initialResume);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState(null);
  const [downloadNote, setDownloadNote] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const [retryToken, setRetryToken] = useState(0);

  useEffect(() => {
    if (!resumeId) return undefined;

    let cancelled = false;
    setLoading(true);
    setError(null);
    resumeService
      .getResume(resumeId)
      .then((detail) => {
        if (!cancelled) setResume(detail);
      })
      .catch((loadError) => {
        if (!cancelled) setError(getErrorMessage(loadError));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [resumeId, retryToken]);

  const handleDownload = async () => {
    setDownloading(true);
    setDownloadError(null);
    setDownloadNote(null);
    try {
      const { url, filename, expiresInSeconds } = await resumeService.getDownloadUrl(resume._id);
      window.open(url, '_blank', 'noopener,noreferrer');
      setDownloadNote(`Downloading ${filename} — link valid for ${Math.round(expiresInSeconds / 60)} minutes`);
    } catch (loadError) {
      setDownloadError(getErrorMessage(loadError, 'Could not prepare the download.'));
    } finally {
      setDownloading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Delete this resume?')) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await resumeService.deleteResume(resume._id); // 204 confirmed first
      if (onDelete) {
        onDelete();
      } else {
        setResume(null);
      }
    } catch (deleteErr) {
      setDeleteError(getErrorMessage(deleteErr, 'Could not delete this resume.'));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return <Loader label="Loading resume..." />;
  }

  if (!resume) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error || 'Resume not found'}
        </div>
        {error ? <Button variant="secondary" onClick={() => setRetryToken((t) => t + 1)}>Retry</Button> : null}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3">
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
        <Button variant="secondary" onClick={() => { setError(null); setRetryToken((t) => t + 1); }}>
          Retry
        </Button>
      </div>
    );
  }

  const statusBadge =
    resume.status === 'ANALYZED'
      ? 'bg-green-50 text-green-700 border-green-200'
      : resume.status === 'FAILED'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-amber-50 text-amber-700 border-amber-200';

  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-[#1F2937]">{resume.originalFilename}</p>
          <p className="mt-1 text-xs text-[#6B7280]">{resume.mimeType} · {(resume.size / 1024).toFixed(1)} KB</p>
        </div>
        <span data-testid="resume-status" className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${statusBadge}`}>
          {resume.status}
        </span>
      </div>

      {resume.status === 'FAILED' ? (
        <div data-testid="resume-failure" className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {FAILURE_REASON_LABELS[resume.failureReason] || resume.failureReason || 'Unknown failure'}
        </div>
      ) : null}

      {resume.status === 'ANALYZED' ? (
        <div className="mt-4">
          <Analysis analysis={resume.analysis} />
        </div>
      ) : null}

      {resume.status === 'UPLOADED' ? (
        <p className="mt-4 text-sm text-[#6B7280]">Analysis not completed — refresh to check the latest state.</p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button variant="secondary" type="button" onClick={handleDownload} disabled={downloading || deleting}>
          {downloading ? 'Preparing download...' : 'Download'}
        </Button>
        <Button type="button" onClick={handleDelete} disabled={deleting || downloading}>
          {deleting ? 'Deleting...' : 'Delete'}
        </Button>
        {onBack ? <Button variant="ghost" type="button" onClick={onBack}>Back to list</Button> : null}
      </div>

      {downloadNote ? <p className="mt-3 text-sm text-[#6B7280]">{downloadNote}</p> : null}
      {downloadError ? <p className="mt-3 text-sm text-red-600">{downloadError}</p> : null}
      {deleteError ? <p className="mt-3 text-sm text-red-600">{deleteError}</p> : null}
    </div>
  );
}