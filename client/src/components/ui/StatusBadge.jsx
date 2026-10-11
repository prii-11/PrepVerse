// StatusBadge — one consistent status treatment across interviews and resumes.
// Neutral + brand semantics; danger is reserved for genuine failure states.
import { cn } from '../../utils/helpers';

const LABELS = {
  CREATED: 'Created',
  IN_PROGRESS: 'In progress',
  SUBMITTED: 'Submitted',
  EVALUATING: 'Evaluating',
  COMPLETED: 'Completed',
  EVALUATION_FAILED: 'Evaluation failed',
  CANCELLED: 'Cancelled',
  ANALYZED: 'Analyzed',
  FAILED: 'Failed',
};

const STYLES = {
  COMPLETED: 'bg-sage-soft text-brand-deep',
  ANALYZED: 'bg-sage-soft text-brand-deep',
  IN_PROGRESS: 'bg-brand/10 text-brand-deep',
  EVALUATING: 'bg-brand/10 text-brand-deep',
  CREATED: 'bg-canvas text-muted border border-line',
  SUBMITTED: 'bg-canvas text-muted border border-line',
  CANCELLED: 'bg-canvas text-faint border border-line',
  EVALUATION_FAILED: 'bg-danger-soft text-danger',
  FAILED: 'bg-danger-soft text-danger',
};

export default function StatusBadge({ status, className }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        STYLES[status] || STYLES.CREATED,
        className,
      )}
    >
      {LABELS[status] || status}
    </span>
  );
}
