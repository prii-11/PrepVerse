// Brand — compact PrepVerse identity anchor. Never a hero element.
import { Link } from 'react-router-dom';
import { APP_NAME, ROUTES } from '../../utils/constants';
import { cn } from '../../utils/helpers';

export function BrandMark({ className }) {
  return (
    <span
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-lg bg-brand text-white',
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-4">
        <path
          d="M12 3.5 4.5 7.25v5.1c0 4.2 3.05 6.9 7.5 8.15 4.45-1.25 7.5-3.95 7.5-8.15v-5.1L12 3.5Z"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <path d="m8.75 11.6 2.35 2.35 4.15-4.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export default function Brand({ to = ROUTES.home }) {
  return (
    <Link
      to={to}
      className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage"
    >
      <BrandMark />
      <span className="text-[17px] font-semibold tracking-tight text-ink">{APP_NAME}</span>
    </Link>
  );
}
