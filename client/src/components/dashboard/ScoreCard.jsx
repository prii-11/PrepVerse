// Dashboard metric card used to show interview readiness scores.
export default function ScoreCard({ title = 'Overall Score', value = 84, subtitle = 'Strong progress this week' }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-gradient-to-br from-[#FFFFFF] to-[#F8F9F5] p-5 shadow-[0_16px_40px_rgba(85,107,47,0.06)]">
      <p className="text-sm text-[#6B7280]">{title}</p>
      <div className="mt-3 text-4xl font-semibold text-[#556B2F]">{value}</div>
      <p className="mt-2 text-sm text-[#6B7280]">{subtitle}</p>
    </div>
  );
}
