// Progress page that summarizes readiness trends and training momentum.
import ProgressGraph from '../../components/dashboard/ProgressGraph';
import ScoreCard from '../../components/dashboard/ScoreCard';

export default function Progress() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Progress</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Track your growth</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <ScoreCard title="Weekly Score" value={88} subtitle="You improved across all mock rounds" />
        <ProgressGraph />
      </div>
    </section>
  );
}
