// Overall score badge for the final interview report.
export default function OverallScore({ score = 84 }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 text-center shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Overall Score</p>
      <div className="mt-3 text-5xl font-semibold text-[#556B2F]">{score}</div>
    </div>
  );
}
