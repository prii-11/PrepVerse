// Card — the one card treatment. Used sparingly: grouped information only
// (readiness, history, feedback). Page titles, questions, and paragraphs
// never go inside cards.
import { cn } from '../../utils/helpers';

export default function Card({ className, children, ...props }) {
  return (
    <div className={cn('rounded-2xl border border-line bg-paper shadow-card', className)} {...props}>
      {children}
    </div>
  );
}
