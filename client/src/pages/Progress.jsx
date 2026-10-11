// Progress — trajectory over time: score progression and interview history.
// Empty by design when there is no data; nothing is fabricated.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import ScoreTrend from '../components/charts/ScoreTrend';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { analyticsService, interviewService } from '../services';
import { ROUTES, reportPath } from '../utils/constants';
import { formatDate } from '../utils/helpers';

export default function Progress() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(null);
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([analyticsService.getProgress(), interviewService.listInterviews()])
      .then(([nextProgress, nextInterviews]) => {
        if (!active) return;
        setProgress(nextProgress);
        setInterviews(nextInterviews.filter((item) => item.status === 'COMPLETED'));
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, []);

  const points = progress?.points ?? [];

  // Presentation-only delta between first and latest completed interviews.
  const trend =
    points.length >= 2
      ? points[points.length - 1].overallScore - points[0].overallScore
      : null;

  return (
    <div className="animate-rise">
      <PageHeader
        title="Progress"
        description="Your interview history and how your performance is trending."
      />

      {error ? (
        <EmptyState
          title="Could not load your progress"
          description="Something went wrong while fetching your history. Please try again."
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : !progress ? (
        <div className="flex justify-center py-24">
          <Spinner className="size-6 text-sage" />
        </div>
      ) : points.length === 0 ? (
        <EmptyState
          title="No completed interviews yet"
          description="Complete your first interview to start seeing your progress."
          action={<Button onClick={() => navigate(ROUTES.interviewSetup)}>Start Interview</Button>}
        />
      ) : (
        <>
          <Card className="p-6 md:p-7">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="text-sm font-medium text-muted">Score progression</h2>
              {trend != null ? (
                <p className="text-sm text-muted">
                  <span
                    className={
                      trend > 0 ? 'font-semibold text-brand-deep' : trend < 0 ? 'font-semibold text-danger' : 'font-semibold text-ink'
                    }
                  >
                    {trend > 0 ? `+${trend}` : trend}
                  </span>{' '}
                  since your first interview
                </p>
              ) : null}
            </div>
            <ScoreTrend points={points} height={180} className="mt-5 w-full" />
            <div className="mt-2 flex justify-between text-xs text-faint">
              <span>{formatDate(points[0].completedAt)}</span>
              <span>{formatDate(points[points.length - 1].completedAt)}</span>
            </div>
          </Card>

          <section className="mt-12" aria-label="Interview history">
            <h2 className="text-lg font-semibold tracking-tight text-ink">Interview history</h2>
            <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper shadow-card">
              {interviews.map((interview) => (
                <li key={interview._id} className="flex flex-wrap items-center gap-x-4 gap-y-2 p-5">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="truncate font-medium text-ink">{interview.targetRole}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {formatDate(interview.completedAt)} · {interview.difficulty}
                    </p>
                  </div>
                  <span className="text-lg font-semibold tabular-nums text-brand-deep">
                    {interview.overallScore}
                    <span className="ml-0.5 text-xs font-normal text-faint">/100</span>
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => navigate(reportPath(interview._id))}>
                    View Report →
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
