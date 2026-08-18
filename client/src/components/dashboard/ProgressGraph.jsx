// Score trend visualization fed by the analytics progress endpoint
// (points: [{ interviewId, completedAt, overallScore }]). Renders an empty
// state when there is no history — never fabricated bars.
function shortDate(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export default function ProgressGraph({ points = [] }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Progress Trend</p>
      {points.length > 0 ? (
        <div className="mt-4 flex h-32 items-end gap-3">
          {points.map((point) => (
            <div key={point.interviewId} className="flex flex-1 flex-col items-center gap-2">
              <span className="text-xs font-medium text-[#6B7280]">
                {typeof point.overallScore === 'number' ? Math.round(point.overallScore) : '—'}
              </span>
              <div
                className="w-full rounded-t-2xl bg-[#A3B18A]"
                style={{ height: `${Math.max(4, Math.min(100, point.overallScore ?? 0))}%` }}
              />
              <span className="text-[10px] text-[#9CA3AF]">{shortDate(point.completedAt)}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-4 text-sm text-[#6B7280]">No completed interviews yet — your trend appears here.</p>
      )}
    </div>
  );
}