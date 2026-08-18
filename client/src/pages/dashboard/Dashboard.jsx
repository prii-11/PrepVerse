// Dashboard — real readiness, progress trend, and weak areas served by the
// analytics API. Loading/error/empty states are handled explicitly; no
// hardcoded metrics.
import { useEffect, useState } from 'react';
import ScoreCard from '../../components/dashboard/ScoreCard';
import ReadinessCard from '../../components/dashboard/ReadinessCard';
import WeakAreaCard from '../../components/dashboard/WeakAreaCard';
import ProgressGraph from '../../components/dashboard/ProgressGraph';
import Loader from '../../components/common/Loader';
import Button from '../../components/common/Button';
import { analyticsService } from '../../services/analyticsService';
import { getErrorMessage } from '../../utils/helpers';

const STEPS = [
  'Upload your resume',
  'Run an AI interview session',
  'Review feedback and improve',
];

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [readiness, progress, practicePlan] = await Promise.all([
        analyticsService.getReadiness(),
        analyticsService.getProgress(),
        analyticsService.getPracticePlan(),
      ]);
      setData({ readiness, progress, practicePlan });
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Interview readiness overview</h1>
      </div>

      {loading ? <Loader label="Loading your readiness..." /> : null}
      {error ? (
        <div className="space-y-3">
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
          <Button variant="secondary" onClick={load}>Retry</Button>
        </div>
      ) : null}

      {!loading && !error && data ? (
        <>
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
            <ScoreCard title="Overall Score" value={data.readiness.score} subtitle={`Based on ${data.readiness.interviewCount} completed interview${data.readiness.interviewCount === 1 ? '' : 's'}`} />
            <ReadinessCard value={data.readiness.score} note={data.readiness.interviewCount === 0 ? 'Complete your first interview to unlock readiness' : 'Computed from the latest completed interviews'} />
            <WeakAreaCard areas={data.practicePlan.skillGaps.map((gap) => `${gap.skillKey} (${gap.reason})`)} emptyLabel="No skill gaps detected" />
            <ProgressGraph points={data.progress.points} />
          </div>

          <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
            <p className="text-sm text-[#6B7280]">Recommended Flow</p>
            <ol className="mt-4 space-y-2 text-sm text-[#1F2937]">
              {STEPS.map((step) => (
                <li key={step} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">
                  {step}
                </li>
              ))}
            </ol>
          </div>
        </>
      ) : null}
    </section>
  );
}