// Interviews — the gateway to the interview experience.
// Page header with the primary action, then the recent interview history.
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Button, { buttonClass } from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { interviewService } from '../services';
import { ROUTES, interviewRoomPath, reportPath } from '../utils/constants';
import { formatDate } from '../utils/helpers';

const ACTIONABLE = ['CREATED', 'IN_PROGRESS'];

export default function Interviews() {
  const navigate = useNavigate();
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    interviewService
      .listInterviews()
      .then((next) => {
        if (active) setInterviews(next);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="animate-rise">
      <PageHeader
        title="Interviews"
        description="Practice realistic interviews and get structured feedback."
        action={
          <Button size="lg" onClick={() => navigate(ROUTES.interviewSetup)}>
            + Start Interview
          </Button>
        }
      />

      <h2 className="text-lg font-semibold tracking-tight text-ink">Recent Interviews</h2>

      {error ? (
        <EmptyState
          className="mt-4"
          title="Could not load your interviews"
          description="Something went wrong while fetching your history. Please try again."
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : !interviews ? (
        <div className="flex justify-center py-24">
          <Spinner className="size-6 text-sage" />
        </div>
      ) : interviews.length === 0 ? (
        <EmptyState
          className="mt-4"
          title="No interviews yet"
          description="Your interview history will appear here. Start your first one to begin tracking progress."
          action={<Button onClick={() => navigate(ROUTES.interviewSetup)}>Start Interview</Button>}
        />
      ) : (
        <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper shadow-card">
          {interviews.map((interview) => {
            const actionable = ACTIONABLE.includes(interview.status);
            return (
              <li key={interview._id} className="flex flex-wrap items-center gap-x-4 gap-y-3 p-5">
                <div className="min-w-0 flex-1 basis-48">
                  <p className="truncate font-medium text-ink">{interview.targetRole}</p>
                  <p className="mt-0.5 text-sm text-muted">
                    {formatDate(interview.completedAt || interview.createdAt)} · {interview.difficulty}
                  </p>
                </div>
                <StatusBadge status={interview.status} />
                {interview.overallScore != null ? (
                  <span className="text-sm font-semibold tabular-nums text-brand-deep">
                    {interview.overallScore}/100
                  </span>
                ) : null}
                {actionable ? (
                  <Button variant="secondary" size="sm" onClick={() => navigate(interviewRoomPath(interview._id))}>
                    Continue
                  </Button>
                ) : interview.status === 'COMPLETED' ? (
                  <Link to={reportPath(interview._id)} className={buttonClass('secondary', 'sm')}>
                    View Report
                  </Link>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
