// Interview progress indicator that shows the user's current round status.
export default function InterviewProgress({ current = 2, total = 5 }) {
  const percent = Math.round((current / total) * 100);

  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Interview Progress</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-[#F3F4F6]">
        <div className="h-full rounded-full bg-[#556B2F]" style={{ width: `${percent}%` }} />
      </div>
      <p className="mt-2 text-sm text-[#6B7280]">
        Question {current} of {total}
      </p>
    </div>
  );
}
