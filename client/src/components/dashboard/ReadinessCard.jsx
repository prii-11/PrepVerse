// Dashboard card that summarizes interview readiness and next steps.
export default function ReadinessCard({ value = null, note = 'Practice more behavioral answers' }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Readiness</p>
      <div className="mt-3 text-3xl font-semibold text-[#1F2937]">
        {value === null || value === undefined ? '—' : `${Math.round(value)}%`}
      </div>
      <p className="mt-2 text-sm text-[#6B7280]">{note}</p>
    </div>
  );
}