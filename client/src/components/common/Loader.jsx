// Minimal loading indicator for async UI states.
export default function Loader({ label = 'Loading...' }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-sm text-[#6B7280]">
      <span className="h-3 w-3 animate-pulse rounded-full bg-[#556B2F]" />
      <span>{label}</span>
    </div>
  );
}
