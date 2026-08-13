// Practice card that represents a single drill or topic block.
export default function PracticeCard({ title = 'Technical Round', description = 'Focus on core concepts and concise explanations.' }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-lg font-medium text-[#1F2937]">{title}</p>
      <p className="mt-2 text-sm text-[#6B7280]">{description}</p>
    </div>
  );
}
