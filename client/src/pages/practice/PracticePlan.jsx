// Practice plan page that organizes improvement into day-based exercises.
import PracticeCard from '../../components/practice/PracticeCard';
import DayCard from '../../components/practice/DayCard';

export default function PracticePlan() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Practice</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Practice plan</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <DayCard />
        <PracticeCard />
      </div>
    </section>
  );
}
