// Compact progress visualization placeholder for the analytics section.
export default function ProgressGraph({ points = [52, 60, 68, 72, 84] }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Progress Trend</p>
      <div className="mt-4 flex h-32 items-end gap-3">
        {points.map((point, index) => (
          <div key={`${point}-${index}`} className="flex-1 rounded-t-2xl bg-[#A3B18A]" style={{ height: `${point}%` }} />
        ))}
      </div>
    </div>
  );
}
