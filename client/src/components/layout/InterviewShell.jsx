// InterviewShell — the dedicated "Interview Room" application shell.
// Replaces the normal dashboard navigation: PrepVerse · Question x of y · Exit.
// The question is the primary visual focus; everything else recedes.
import { BrandMark } from './Brand';
import ProgressSteps from '../ui/ProgressSteps';
import Button from '../ui/Button';
import { cn } from '../../utils/helpers';

export default function InterviewShell({
  questionNumber,
  questionTotal,
  onExit,
  exiting = false,
  children,
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1280px] items-center justify-between gap-4 px-5 md:px-8">
          <div className="flex items-center gap-2.5">
            <BrandMark />
            <span className="text-[17px] font-semibold tracking-tight text-ink">PrepVerse</span>
          </div>

          <p className="absolute left-1/2 -translate-x-1/2 text-sm text-muted">
            <span className="font-medium text-ink">Question {questionNumber}</span> of {questionTotal}
          </p>

          <Button variant="ghost" size="sm" onClick={onExit} loading={exiting}>
            Exit
          </Button>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col px-5 pb-10 pt-10 md:px-8">
        {children}
      </main>
    </div>
  );
}

// Inline progress strip rendered by the room under the header.
export function InterviewProgressStrip({ total, current, className }) {
  return (
    <div className={cn('mb-12 flex items-center justify-center', className)}>
      <ProgressSteps total={total} current={current} />
    </div>
  );
}
