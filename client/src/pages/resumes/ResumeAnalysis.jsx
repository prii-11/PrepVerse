// ResumeAnalysis — the actual extracted information, nothing invented.
// Sections: Extracted Skills · Experience Summary · Projects · Strengths ·
// Skill Gaps. No resume score / ATS score / confidence percentage exists.
import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Button, { buttonClass } from '../../components/ui/Button';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { resumeService } from '../../services';
import { ROUTES } from '../../utils/constants';
import { formatDate } from '../../utils/helpers';

function Chip({ children }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-canvas px-3 py-1.5 text-[13px] font-medium text-ink">
      {children}
    </span>
  );
}

export default function ResumeAnalysis() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [resume, setResume] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    resumeService
      .getResume(id)
      .then((next) => {
        if (!active) return;
        if (next.status !== 'ANALYZED' || !next.analysis) {
          navigate(ROUTES.resume, { replace: true });
          return;
        }
        setResume(next);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, [id, navigate]);

  if (error) {
    return (
      <div className="py-16 animate-rise">
        <EmptyState
          title={error.status === 404 ? 'Resume not found' : 'Could not load the analysis'}
          description="This resume may belong to another account or may have been removed."
          action={<Button onClick={() => navigate(ROUTES.resume)}>Back to Resumes</Button>}
        />
      </div>
    );
  }

  if (!resume) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6 text-sage" />
      </div>
    );
  }

  const { analysis } = resume;

  return (
    <div className="animate-rise pb-4">
      <Link to={ROUTES.resume} className={buttonClass('ghost', 'sm', '-ml-3')}>
        ← Back
      </Link>

      <header className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[32px]">
            {resume.originalFilename}
          </h1>
          <p className="mt-1.5 text-sm text-muted">Uploaded {formatDate(resume.createdAt)}</p>
        </div>
      </header>

      {/* Extracted skills */}
      <section className="mt-10" aria-label="Extracted skills">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Extracted Skills</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {(analysis.extractedSkills || []).map((skill) => (
            <Chip key={skill}>{skill}</Chip>
          ))}
        </div>
      </section>

      {/* Experience summary */}
      <section className="mt-10 max-w-3xl" aria-label="Experience summary">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Experience Summary</h2>
        <p className="mt-3 text-[15px] leading-relaxed text-muted">{analysis.experienceSummary}</p>
      </section>

      {/* Projects */}
      {analysis.projects?.length ? (
        <section className="mt-10" aria-label="Projects">
          <h2 className="text-lg font-semibold tracking-tight text-ink">Projects</h2>
          <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper shadow-card">
            {analysis.projects.map((project) => (
              <article key={project.name} className="p-6">
                <h3 className="font-medium text-ink">{project.name}</h3>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted">
                  {project.description}
                </p>
                {project.technologies?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {project.technologies.map((tech) => (
                      <span
                        key={tech}
                        className="rounded-md bg-sage-soft px-2 py-0.5 text-xs font-medium text-brand-deep"
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {/* Strengths + skill gaps */}
      <section className="mt-10 grid gap-4 md:grid-cols-2" aria-label="Strengths and skill gaps">
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-brand-deep">Strengths</h2>
          <ul className="mt-4 space-y-2.5">
            {(analysis.strengths || []).map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 size-[18px] shrink-0 text-brand" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-ink">Skill Gaps</h2>
          <ul className="mt-4 space-y-2.5">
            {(analysis.skillGaps || []).map((item) => (
              <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink">
                <svg viewBox="0 0 24 24" fill="none" className="mt-0.5 size-[18px] shrink-0 text-sage" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" />
                </svg>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
