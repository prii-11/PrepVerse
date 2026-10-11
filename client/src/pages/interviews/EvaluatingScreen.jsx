// EvaluatingScreen — the dedicated post-submit evaluation state.
// Reassuring, specific, and honest about what is happening. No generic spinner.
import { useEffect, useState } from 'react';
import Spinner from '../../components/ui/Spinner';

const STEPS = [
  { label: 'Reviewing responses', doneAfterMs: 900 },
  { label: 'Evaluating skills', doneAfterMs: 1800 },
  { label: 'Preparing your report', doneAfterMs: Infinity },
];

export default function EvaluatingScreen({ startedAt }) {
  const [now, setNow] = useState(() => Date.now());

  // Tick so the checklist advances while the submit request is in flight.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 400);
    return () => clearInterval(timer);
  }, []);

  const elapsed = now - (startedAt || now);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center text-center animate-fade">
      <span className="inline-flex size-12 items-center justify-center rounded-full bg-sage-soft">
        <svg viewBox="0 0 24 24" fill="none" className="size-6 text-brand" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>

      <h1 className="mt-6 text-[26px] font-semibold tracking-tight text-ink md:text-3xl">
        Interview submitted
      </h1>
      <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-muted">
        We received your answers and are evaluating your responses.
      </p>

      <ul className="mt-10 w-full max-w-xs space-y-4 text-left">
        {STEPS.map((step, index) => {
          const done = elapsed >= step.doneAfterMs;
          const active = !done && (index === 0 || elapsed >= STEPS[index - 1].doneAfterMs);
          return (
            <li key={step.label} className="flex items-center gap-3">
              <span className="flex w-5 justify-center">
                {done ? (
                  <svg viewBox="0 0 24 24" fill="none" className="size-[18px] text-brand" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                ) : active ? (
                  <Spinner className="size-[18px] text-sage" />
                ) : (
                  <span className="size-2 rounded-full border border-faint/70 bg-paper" />
                )}
              </span>
              <span className={done ? 'text-sm font-medium text-brand-deep' : active ? 'text-sm font-medium text-ink' : 'text-sm text-faint'}>
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>

      <p className="mt-12 text-xs text-faint">This usually takes under a minute.</p>
    </div>
  );
}
