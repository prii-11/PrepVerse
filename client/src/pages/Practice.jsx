// Practice — focused on skill gaps from GET /analytics/practice-plan.
// The API sends canonical skillKeys + a reason code ('missing' |
// 'unassessed' | 'under-level'); display names and sentences are presentation
// concerns that live here, never business logic.
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/layout/PageHeader';
import Button from '../components/ui/Button';
import EmptyState from '../components/ui/EmptyState';
import Spinner from '../components/ui/Spinner';
import { analyticsService } from '../services';
import { ROUTES } from '../utils/constants';

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

function gapNarrative(gap) {
  const required = LEVEL_LABELS[gap.requiredMinimumLevel] ?? gap.requiredMinimumLevel;
  if (gap.reason === 'missing') {
    return `Required for this role at ${required} level, but it has not surfaced in your resume or interviews yet.`;
  }
  if (gap.reason === 'unassessed') {
    return 'On your radar but never exercised in an interview, so your level is still unknown. Answer questions on it to get assessed.';
  }
  return `Currently assessed at ${LEVEL_LABELS[gap.currentLevel] ?? 'an unknown'} level — below the ${required} this role expects.`;
}

export default function Practice() {
  const navigate = useNavigate();
  const [plan, setPlan] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let active = true;
    analyticsService
      .getPracticePlan()
      .then((next) => {
        if (active) setPlan(next);
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
        title="Practice"
        description="Focus on the skills that will improve your readiness."
      />

      {error ? (
        <EmptyState
          title="Could not load your practice plan"
          description="Something went wrong while fetching your focus areas. Please try again."
          action={<Button onClick={() => window.location.reload()}>Retry</Button>}
        />
      ) : !plan ? (
        <div className="flex justify-center py-24">
          <Spinner className="size-6 text-sage" />
        </div>
      ) : plan.skillGaps.length === 0 ? (
        <EmptyState
          title="You are on track"
          description="No skill gaps detected for your target role right now. Keep interviewing to stay sharp."
          action={<Button onClick={() => navigate(ROUTES.interviewSetup)}>Start Interview</Button>}
        />
      ) : (
        <div className="space-y-4">
          {plan.skillGaps.map((gap) => (
            <section
              key={gap.skillKey}
              className="rounded-2xl border border-line bg-paper p-6 shadow-card md:p-7"
              aria-label={SKILL_LABELS[gap.skillKey] ?? gap.skillKey}
            >
              <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-semibold tracking-tight text-ink">
                    {SKILL_LABELS[gap.skillKey] ?? gap.skillKey}
                  </h2>

                  <dl className="mt-4 flex gap-10">
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                        Current level
                      </dt>
                      <dd className="mt-1 text-[15px] font-medium text-ink">
                        {gap.currentLevel ? LEVEL_LABELS[gap.currentLevel] : 'Not assessed'}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs font-medium uppercase tracking-wide text-faint">
                        Required level
                      </dt>
                      <dd className="mt-1 text-[15px] font-medium text-brand-deep">
                        {LEVEL_LABELS[gap.requiredMinimumLevel]}
                      </dd>
                    </div>
                  </dl>

                  <p className="mt-5 max-w-xl text-sm leading-relaxed text-muted">
                    {gapNarrative(gap)}
                  </p>
                </div>

                <div className="shrink-0 lg:pt-1">
                  <Button onClick={() => navigate(ROUTES.interviewSetup)}>Practice</Button>
                </div>
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
