// ProgressSteps — the interview-room progress indicator:
// ● ─── ● ─── ○ ─── ○  (answered / current / upcoming)
import { cn } from '../../utils/helpers';

export default function ProgressSteps({ total, current, className }) {
  return (
    <div className={cn('flex items-center', className)} aria-label={`Question ${current + 1} of ${total}`}>
      {Array.from({ length: total }, (_, index) => {
        const state = index < current ? 'done' : index === current ? 'current' : 'todo';
        return (
          <div key={index} className="flex items-center">
            {index > 0 ? (
              <span
                className={cn(
                  'h-px w-8 transition-colors duration-300 sm:w-12',
                  index <= current ? 'bg-brand/50' : 'bg-line',
                )}
              />
            ) : null}
            <span
              className={cn(
                'size-2 rounded-full transition-all duration-300',
                state === 'done' && 'bg-brand',
                state === 'current' && 'size-2.5 bg-brand ring-4 ring-brand/15',
                state === 'todo' && 'border border-faint/60 bg-paper',
              )}
            />
          </div>
        );
      })}
    </div>
  );
}
