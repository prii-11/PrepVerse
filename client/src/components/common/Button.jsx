// Reusable button component with Tailwind variants for the design system.
import { cn } from '../../utils/helpers';

export default function Button({ children, className = '', variant = 'primary', ...props }) {
  // Each variant maps to a specific visual role in the olive theme.
  const variants = {
    primary: 'bg-[#556B2F] text-white shadow-[0_12px_24px_rgba(85,107,47,0.18)] hover:bg-[#4B5D2A] hover:shadow-[0_16px_28px_rgba(85,107,47,0.22)]',
    secondary: 'border border-[#A3B18A] bg-white text-[#556B2F] hover:bg-[#F8F9F5]',
    ghost: 'bg-transparent text-[#556B2F] hover:bg-[#F8F9F5]',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-2xl px-4 py-2 text-sm font-medium transition-all duration-300 ease-out focus:outline-none focus:ring-2 focus:ring-[#A3B18A]/70 disabled:cursor-not-allowed disabled:opacity-60',
        variants[variant] || variants.primary,
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
