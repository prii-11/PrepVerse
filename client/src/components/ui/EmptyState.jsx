// EmptyState — quiet placeholder for lists with no data yet.
// Never fabricates content; states exactly what will appear and why.
import { cn } from '../../utils/helpers';

export default function EmptyState({ title, description, action, className }) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-paper/60 px-6 py-14 text-center',
        className,
      )}
    >
      {title ? <p className="text-[15px] font-medium text-ink">{title}</p> : null}
      {description ? (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted">{description}</p>
      ) : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
