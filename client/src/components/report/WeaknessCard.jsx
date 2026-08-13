// Report card that surfaces improvement areas from the interview review.
export default function WeaknessCard({ weaknesses = ['Pace control', 'Depth of examples'] }) {
  return (
    <div className="rounded-3xl border border-[#E5E7EB] bg-white p-5 shadow-[0_16px_40px_rgba(85,107,47,0.05)]">
      <p className="text-sm text-[#6B7280]">Weaknesses</p>
      <ul className="mt-4 space-y-2 text-sm text-[#1F2937]">
        {weaknesses.map((item) => (
          <li key={item} className="rounded-2xl bg-[#F8F9F5] px-3 py-2">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
