// Button — the single button treatment for the whole product.
import Spinner from './Spinner';
import { cn } from '../../utils/helpers';

const VARIANTS = {
  primary:
    'bg-brand text-white shadow-[0_1px_2px_rgb(85_107_47/0.3)] hover:bg-brand-strong active:bg-brand-deep',
  secondary:
    'border border-line bg-paper text-ink hover:border-sage hover:bg-sage-soft/50 hover:text-brand-deep',
  ghost: 'text-muted hover:bg-canvas hover:text-ink',
  danger: 'bg-danger text-white hover:bg-[#9a1e13]',
  'danger-ghost': 'text-danger hover:bg-danger-soft',
};

const SIZES = {
  sm: 'h-8 gap-1.5 rounded-lg px-3 text-[13px]',
  md: 'h-10 gap-2 rounded-xl px-4 text-sm',
  lg: 'h-11 gap-2 rounded-xl px-5 text-[15px]',
};

export function buttonClass(variant = 'primary', size = 'md', className) {
  return cn(
    'inline-flex select-none items-center justify-center whitespace-nowrap font-medium transition-colors duration-150',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage focus-visible:ring-offset-2 focus-visible:ring-offset-paper',
    'disabled:pointer-events-none disabled:opacity-55',
    VARIANTS[variant] || VARIANTS.primary,
    SIZES[size] || SIZES.md,
    className,
  );
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  ...props
}) {
  return (
    <button
      className={buttonClass(variant, size, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <Spinner className="size-4" /> : null}
      {children}
    </button>
  );
}
