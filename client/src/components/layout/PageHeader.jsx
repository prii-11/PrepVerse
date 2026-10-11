// PageHeader — every main page opens with: title · short explanation · primary action.
// The header is NOT a card; it sits directly on the canvas and breathes.
import { cn } from '../../utils/helpers';

export default function PageHeader({ title, description, action, className }) {
  return (
    <div
      className={cn(
        'mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between md:mb-10',
        className,
      )}
    >
      <div className="max-w-2xl">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-ink md:text-[32px]">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-[15px] leading-relaxed text-muted">{description}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
