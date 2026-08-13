// Dashboard landing page that combines readiness, metrics, and next actions.
import ScoreCard from '../../components/dashboard/ScoreCard';
import ReadinessCard from '../../components/dashboard/ReadinessCard';
import WeakAreaCard from '../../components/dashboard/WeakAreaCard';
import ProgressGraph from '../../components/dashboard/ProgressGraph';
import { DEMO_STEPS, DEMO_WEAK_AREAS } from '../../utils/constants';

export default function Dashboard() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Dashboard</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Interview readiness overview</h1>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <ScoreCard />
        <ReadinessCard />
        <WeakAreaCard areas={DEMO_WEAK_AREAS} />
        <ProgressGraph />
      </div>
      <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
        <p className="text-sm text-[#6B7280]">Recommended Flow</p>
        <ol className="mt-4 space-y-2 text-sm text-[#1F2937]">
          {DEMO_STEPS.map((step) => (
            <li key={step} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">
              {step}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
