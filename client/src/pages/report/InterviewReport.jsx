// Final interview report page with scores, strengths, weaknesses, and feedback.
import OverallScore from '../../components/report/OverallScore';
import StrengthCard from '../../components/report/StrengthCard';
import WeaknessCard from '../../components/report/WeaknessCard';
import FeedbackCard from '../../components/report/FeedbackCard';

export default function InterviewReport() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-[#6B8E23]">Report</p>
        <h1 className="mt-3 text-3xl font-semibold text-[#1F2937]">Interview report</h1>
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <OverallScore />
        <StrengthCard />
        <WeaknessCard />
        <FeedbackCard />
      </div>
    </section>
  );
}
