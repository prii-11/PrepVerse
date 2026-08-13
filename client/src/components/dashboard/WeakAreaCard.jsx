// Dashboard card that highlights weak areas for focused improvement.
export default function WeakAreaCard({ areas = ['System Design', 'Behavioral Answers'] }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Weak Areas</p>
      <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
        {areas.map((area) => (
          <li key={area} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">
            {area}
          </li>
        ))}
      </ul>
    </div>
  );
}
