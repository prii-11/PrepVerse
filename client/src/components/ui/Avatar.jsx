// Avatar — initials-based identity anchor for the top bar and profile.
import { cn } from '../../utils/helpers';

export default function Avatar({ name = '', className }) {
  const label = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');

  return (
    <span
      className={cn(
        'inline-flex size-9 shrink-0 select-none items-center justify-center rounded-full bg-sage-soft text-[13px] font-semibold text-brand-deep ring-1 ring-inset ring-sage/40',
        className,
      )}
      aria-hidden="true"
    >
      {label || '?'}
    </span>
  );
}
