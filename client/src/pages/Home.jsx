// Home — the command center. Answers three questions immediately:
// How am I doing? What needs improvement? What should I do next?
import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import StatusBadge from '../components/ui/StatusBadge';
import ScoreTrend from '../components/charts/ScoreTrend';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { analyticsService, interviewService } from '../services';
import useAuth from '../hooks/useAuth';
import { ROUTES, interviewRoomPath, reportPath } from '../utils/constants';
import { formatDate, timeGreeting } from '../utils/helpers';

const LEVEL_LABELS = { BEGINNER: 'Beginner', INTERMEDIATE: 'Intermediate', ADVANCED: 'Advanced' };

const SKILL_LABELS = {
  javascript: 'JavaScript',
  nodejs: 'Node.js',
  sql: 'SQL',
  'rest-apis': 'REST APIs',
  nosql: 'NoSQL',
  mongodb: 'MongoDB',
  'system-design': 'System Design',
  testing: 'Automated Testing',
};

// Readiness breakdown components in canonical order (docs/07 §6). Null values
// are skipped at render time — a component with no data yet simply has no row.
const BREAKDOWN_LABELS = [
  ['technical', 'Technical depth'],
  ['communication', 'Communication'],
  ['skillCoverage', 'Skill coverage'],
  ['consistency', 'Consistency'],
  ['improvementTrend', 'Improvement trend'],
];

export default function Home() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [readiness, setReadiness] = useState(null);
  const [progress, setProgress] = useState(null);
  const [plan, setPlan] = useState(null);
  const [interviews, setInterviews] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      analyticsService.getReadiness(),
      analyticsService.getProgress(),
      analyticsService.getPracticePlan(),
      interviewService.listInterviews(),
    ])
      .then(([nextReadiness, nextProgress, nextPlan, nextInterviews]) => {
        if (!active) return;
        setReadiness(nextReadiness);
        setProgress(nextProgress);
        setPlan(nextPlan);
        setInterviews(nextInterviews);
      })
      .catch((cause) => {
        if (active) setError(cause);
      });
    return () => {
      active = false;
    };
  }, []);

  const name = auth.user?.firstName || 'there';
  const recent = (interviews || []).slice(0, 3);
  const focusSkills = (plan?.skillGaps || []).slice(0, 2);
  const breakdownRows = BREAKDOWN_LABELS.filter(([key]) => readiness?.breakdown?.[key] != null).map(
    ([key, label]) => ({ key, label, value: Math.round(readiness.breakdown[key]) })
  );

  return (
    <div className="animate-rise">
      {/* Greeting */}
      <p className="text-sm font-medium text-brand">{timeGreeting()}, {name}</p>
      <h1 className="mt-1 text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[32px]">
        Here is where you stand.
      </h1>
      <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
        Your readiness, what to improve, and your next step — all in one place.
      </p>

      {error ? (
        <EmptyState
          className="mt-8"
          title="Could not load your dashboard"
          description="Something went wrong while fetching your data. Please try again."
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : !readiness ? (
        <div className="flex justify-center py-24">
          <Spinner className="size-6 text-sage" />
        </div>
      ) : (
        <>
          {/* Readiness + Progress */}
          <section className="mt-8 grid gap-4 md:grid-cols-5" aria-label="Readiness and progress">
            <Card className="p-6 md:col-span-2">
              <h2 className="text-sm font-medium text-muted">Interview readiness</h2>
              <div className="mt-3 flex items-end gap-2">
                <span className="text-[56px] font-semibold leading-none tracking-tight text-brand-deep">
                  {readiness.score != null ? Math.round(readiness.score) : '—'}
                </span>
                <span className="pb-1.5 text-lg text-faint">/ 100</span>
              </div>
              <p className="mt-1 text-xs text-faint">
                Based on {readiness.interviewCount} completed{' '}
                {readiness.interviewCount === 1 ? 'interview' : 'interviews'}
              </p>
              <div className="mt-5 space-y-3">
                {breakdownRows.length === 0 ? (
                  <p className="text-sm text-muted">
                    Complete your first interview to unlock your readiness breakdown.
                  </p>
                ) : (
                  breakdownRows.map((row) => (
                    <div key={row.key}>
                      <div className="mb-1 flex items-center justify-between text-xs">
                        <span className="text-muted">{row.label}</span>
                        <span className="font-medium text-ink">{row.value}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-canvas">
                        <div
                          className="h-full rounded-full bg-sage transition-all duration-500"
                          style={{ width: `${row.value}%` }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </Card>

            <Card className="flex flex-col p-6 md:col-span-3">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-medium text-muted">Score progression</h2>
                {progress?.points?.length ? (
                  <Link to={ROUTES.progress} className="text-xs font-medium text-brand hover:text-brand-deep">
                    View progress →
                  </Link>
                ) : null}
              </div>
              {progress?.points?.length ? (
                <>
                  <ScoreTrend points={progress.points} height={130} className="mt-4 w-full" />
                  <p className="mt-3 text-xs text-faint">
                    Last interview {formatDate(progress.points[progress.points.length - 1].completedAt)} ·{' '}
                    {progress.points.length} completed
                  </p>
                </>
              ) : (
                <p className="my-auto py-10 text-center text-sm text-muted">
                  Complete your first interview to start seeing your progress.
                </p>
              )}
            </Card>
          </section>

          {/* Practice recommendations */}
          <section className="mt-12" aria-label="What needs improvement">
            <div className="flex items-end justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-ink">What to focus on</h2>
                <p className="mt-1 text-sm text-muted">
                  Based on your target role — {plan?.targetRole}.
                </p>
              </div>
              <Link
                to={ROUTES.practice}
                className="hidden text-sm font-medium text-brand hover:text-brand-deep sm:block"
              >
                All focus areas →
              </Link>
            </div>

            <div className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper shadow-card">
              {focusSkills.map((gap) => (
                <div key={gap.skillKey} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-ink">{SKILL_LABELS[gap.skillKey] ?? gap.skillKey}</p>
                    <p className="mt-0.5 text-sm text-muted">
                      {gap.currentLevel
                        ? `${LEVEL_LABELS[gap.currentLevel]} now`
                        : 'Not yet assessed'}{' '}
                      · requires {LEVEL_LABELS[gap.requiredMinimumLevel]}
                    </p>
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => navigate(ROUTES.interviewSetup)}>
                    Practice
                  </Button>
                </div>
              ))}
            </div>
          </section>

          {/* Recent interviews */}
          <section className="mt-12" aria-label="Recent interviews">
            <div className="flex items-end justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-ink">Recent interviews</h2>
              <Link
                to={ROUTES.interviews}
                className="text-sm font-medium text-brand hover:text-brand-deep"
              >
                View all →
              </Link>
            </div>

            {recent.length === 0 ? (
              <EmptyState
                className="mt-4"
                title="No interviews yet"
                description="Start your first interview and your results will appear here."
                action={<Button onClick={() => navigate(ROUTES.interviewSetup)}>Start Interview</Button>}
              />
            ) : (
              <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-paper shadow-card">
                {recent.map((interview) => (
                  <li key={interview._id} className="flex items-center gap-4 p-5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-ink">{interview.targetRole}</p>
                      <p className="mt-0.5 text-sm text-muted">
                        {formatDate(interview.completedAt || interview.createdAt)} · {interview.difficulty}
                      </p>
                    </div>
                    <StatusBadge status={interview.status} />
                    {interview.overallScore != null ? (
                      <span className="w-14 text-right text-sm font-semibold text-brand-deep">
                        {interview.overallScore}/100
                      </span>
                    ) : null}
                    {interview.status === 'COMPLETED' ? (
                      <Link
                        to={reportPath(interview._id)}
                        className="shrink-0 text-sm font-medium text-brand hover:text-brand-deep"
                      >
                        View Report
                      </Link>
                    ) : (
                      <Link
                        to={interviewRoomPath(interview._id)}
                        className="shrink-0 text-sm font-medium text-brand hover:text-brand-deep"
                      >
                        Continue
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
