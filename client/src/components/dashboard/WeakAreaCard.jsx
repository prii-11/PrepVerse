// Dashboard card that highlights weak areas for focused improvement.
export default function WeakAreaCard({ areas = [], emptyLabel = 'No weak areas right now' }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Weak Areas</p>
      {areas.length > 0 ? (
        <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
          {areas.map((area) => (
            <li key={area} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">
              {area}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-[#6B7280]">{emptyLabel}</p>
      )}
    </div>
  );
}