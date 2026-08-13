// Resume score summary displayed after analysis completes.
export default function ResumeScore({ score = 86 }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 text-center shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Resume Score</p>
      <div className="mt-3 text-4xl font-semibold text-[#556B2F]">{score}</div>
      <p className="mt-2 text-sm text-[#6B7280]">ATS and role fit estimate</p>
    </div>
  );
}
