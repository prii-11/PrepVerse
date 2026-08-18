// Resume list — the backend summary (GET /resumes) with loading, populated,
// empty, and failure/retry states. Selection bubbles up via onSelect.
import { useCallback, useEffect, useState } from 'react';
import Loader from '../../components/common/Loader';
import Button from '../../components/common/Button';
import { resumeService } from '../../services/resumeService';
import { getErrorMessage } from '../../utils/helpers';

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

const STATUS_BADGES = {
  ANALYZED: 'bg-green-50 text-green-700 border-green-200',
  FAILED: 'bg-red-50 text-red-700 border-red-200',
  UPLOADED: 'bg-amber-50 text-amber-700 border-amber-200',
};

export default function ResumeList({ onSelect }) {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await resumeService.listResumes();
      setResumes(list);
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="space-y-4">
      {loading ? <Loader label="Loading resumes..." /> : null}

      {error ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      ) : null}

      {!loading && !error && resumes.length === 0 ? (
        <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 text-sm text-[#6B7280] shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
          No resumes yet — upload one to get an analysis.
        </div>
      ) : null}

      {!loading && !error && resumes.length > 0 ? (
        <div className="space-y-2">
          {resumes.map((resume) => (
            <button
              key={resume._id}
              type="button"
              onClick={() => onSelect(resume._id)}
              className="flex w-full items-center justify-between gap-4 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-left transition hover:border-[#A3B18A] hover:bg-[#F8F9F5]"
              data-testid={`resume-row-${resume._id}`}
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-[#1F2937]">{resume.originalFilename}</p>
                <p className="mt-1 text-xs text-[#6B7280]">{formatDate(resume.createdAt)}</p>
              </div>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-medium ${STATUS_BADGES[resume.status] || STATUS_BADGES.UPLOADED}`}>
                {resume.status}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}