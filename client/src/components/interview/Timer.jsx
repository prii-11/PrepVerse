// Timer widget for interview sessions and practice rounds.
export default function Timer({ minutes = 15, seconds = 0 }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 text-center">
      <p className="text-sm text-slate-400">Time Remaining</p>
      <div className="mt-3 text-4xl font-semibold text-white">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
      </div>
    </div>
  );
}
