// Question display card for the live interview screen.
export default function QuestionCard({ question = 'Tell me about yourself.' }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5">
      <p className="text-sm text-slate-400">Current Question</p>
      <p className="mt-3 text-lg font-medium text-white">{question}</p>
    </div>
  );
}
