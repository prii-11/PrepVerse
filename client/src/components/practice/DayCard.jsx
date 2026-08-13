// Practice day card for a guided improvement plan.
export default function DayCard({ day = 'Day 1', focus = 'Resume review and self-introduction' }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B8E23]">{day}</p>
      <p className="mt-2 text-sm text-[#1F2937]">{focus}</p>
    </div>
  );
}
