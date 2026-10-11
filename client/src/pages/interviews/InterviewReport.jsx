// InterviewReport — the conclusion of the interview.
// Renders only contract fields (docs/20 §5): overallScore, technicalScore,
// communicationScore, strengths, weaknesses, recommendations, questionResults.
// Per-question entries show technical + communication scores only — there is
// no per-answer "overall score" in the backend.
import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../../components/ui/Button';
import Card from '../../components/ui/Card';
import Spinner from '../../components/ui/Spinner';
import EmptyState from '../../components/ui/EmptyState';
import { interviewService } from '../../services';
import { ROUTES } from '../../utils/constants';
import { formatDate } from '../../utils/helpers';

function ScoreBlock({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-ink">
        {value ?? '—'}
        <span className="ml-0.5 text-sm font-normal text-faint">/100</span>
      </p>
    </div>
  );
}

function FeedbackList({ items, tone }) {
  const marker = tone === 'positive' ? 'text-brand' : 'text-sage';
  return (
    <ul className="space-y-2.5">
      {(items || []).map((item) => (
        <li key={item} className="flex gap-3 text-[15px] leading-relaxed text-ink">
          <svg viewBox="0 0 24 24" fill="none" className={`mt-0.5 size-[18px] shrink-0 ${marker}`} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            {tone === 'positive' ? <path d="M20 6 9 17l-5-5" /> : <path d="M12 8v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />}
          </svg>
          {item}
        </li>
      ))}
    </ul>
  );
}

export default function InterviewReport() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    interviewService
      .getInterview(id)
      .then((detail) => {
        if (!active) return;
        if (detail.status !== 'COMPLETED' || !detail.report) {
          setError(new Error('not-available'));
          return;
        }
        setData(detail);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, [id]);

  if (error) {
    return (
      <div className="py-16 animate-rise">
        <EmptyState
          title={error.status === 404 ? 'Report not available yet' : 'Could not load the report'}
          description={
            error.status === 404
              ? 'The evaluation has not finished for this interview. Check back shortly.'
              : 'This report may belong to another account or may have been removed.'
          }
          action={<Button onClick={() => navigate(ROUTES.interviews)}>Back to Interviews</Button>}
        />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex justify-center py-24">
        <Spinner className="size-6 text-sage" />
      </div>
    );
  }

  const { report } = data;

  return (
    <div className="animate-rise pb-4">
      {/* HEADER — the conclusion */}
      <header>
        <p className="text-sm font-medium text-brand">Interview complete</p>
        <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[32px]">
          {data.targetRole}
        </h1>
        <p className="mt-1.5 text-sm text-muted">
          {data.difficulty} · Completed {formatDate(data.completedAt)}
        </p>
      </header>

      {/* OVERALL PERFORMANCE */}
      <Card className="mt-8 p-6 md:p-7">
        <h2 className="text-sm font-medium text-muted">Overall performance</h2>
        <div className="mt-4 flex flex-col gap-8 md:flex-row md:items-end md:justify-between">
          <div className="flex items-end gap-2">
            <span className="text-[64px] font-semibold leading-none tracking-tight text-brand-deep tabular-nums">
              {report.overallScore}
            </span>
            <span className="pb-2 text-lg text-faint">/ 100</span>
          </div>
          <div className="flex gap-12">
            <ScoreBlock label="Technical" value={report.technicalScore} />
            <ScoreBlock label="Communication" value={report.communicationScore} />
          </div>
        </div>
        {report.profileSyncStatus === 'PENDING' ? (
          <p className="mt-6 border-t border-line pt-4 text-xs text-faint">
            Your skill profile is being updated with these results — it may take a moment to appear
            on your Home and Progress pages.
          </p>
        ) : null}
      </Card>

      {/* STRENGTHS + AREAS TO IMPROVE */}
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-brand-deep">Strengths</h2>
          <div className="mt-4">
            {report.strengths?.length ? (
              <FeedbackList items={report.strengths} tone="positive" />
            ) : (
              <p className="text-sm text-muted">No clear strengths were detected in this run.</p>
            )}
          </div>
        </div>
        <div className="rounded-2xl border border-line bg-paper p-6 shadow-card">
          <h2 className="text-base font-semibold tracking-tight text-ink">Areas to improve</h2>
          <div className="mt-4">
            {report.weaknesses?.length ? (
              <FeedbackList items={report.weaknesses} tone="improve" />
            ) : (
              <p className="text-sm text-muted">No significant weaknesses were detected.</p>
            )}
          </div>
        </div>
      </section>

      {/* QUESTION-BY-QUESTION */}
      <section className="mt-12">
        <h2 className="text-lg font-semibold tracking-tight text-ink">Question-by-question feedback</h2>
        <div className="mt-4 space-y-4">
          {(report.questionResults || []).map((result, index) => (
            <article key={index} className="rounded-2xl border border-line bg-paper p-6 shadow-card">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-faint">
                    Question {index + 1}
                  </p>
                  <h3 className="mt-1.5 max-w-xl font-medium leading-snug text-ink">{result.text}</h3>
                </div>
                <dl className="flex shrink-0 gap-6 text-right">
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">Technical</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{result.technicalScore}</dd>
                  </div>
                  <div>
                    <dt className="text-[11px] font-medium uppercase tracking-wide text-faint">Communication</dt>
                    <dd className="mt-0.5 text-lg font-semibold tabular-nums text-ink">{result.communicationScore}</dd>
                  </div>
                </dl>
              </div>

              {(result.strengths?.length || result.weaknesses?.length) && (
                <div className="mt-4 grid gap-4 border-t border-line pt-4 md:grid-cols-2">
                  {result.strengths?.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-brand">Strengths</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-muted">
                        {result.strengths.map((item) => (
                          <li key={item}>· {item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  {result.weaknesses?.length ? (
                    <div>
                      <p className="text-xs font-medium uppercase tracking-wide text-muted">To improve</p>
                      <ul className="mt-1.5 space-y-1 text-sm text-muted">
                        {result.weaknesses.map((item) => (
                          <li key={item}>· {item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </div>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* THE LOOP: report → weak areas → practice → next interview */}
      <section className="mt-12 rounded-2xl border border-line bg-sage-soft/50 p-6 md:p-7">
        <h2 className="text-lg font-semibold tracking-tight text-ink">What should you do next?</h2>
        {report.recommendations?.length ? (
          <ul className="mt-3 space-y-1.5 text-sm leading-relaxed text-muted">
            {report.recommendations.map((item) => (
              <li key={item}>· {item}</li>
            ))}
          </ul>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-3">
          <Button onClick={() => navigate(ROUTES.practice)}>Practice weak areas</Button>
          <Button variant="secondary" onClick={() => navigate(ROUTES.home)}>
            Back to Home
          </Button>
        </div>
      </section>
    </div>
  );
}
