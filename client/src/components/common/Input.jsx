// Reusable input component with label and helper text support.
import { cn } from '../../utils/helpers';

export default function Input({ label, helperText, rightElement, className = '', ...props }) {
  return (
    <label className="flex w-full flex-col gap-2 text-sm text-[#6B7280]">
      {label ? <span className="font-medium text-[#1F2937]">{label}</span> : null}
      <div className="relative">
        <input
          className={cn(
            'w-full rounded-2xl border border-[#E5E7EB] bg-white px-4 py-3 text-[#1F2937] outline-none transition placeholder:text-[#9CA3AF] focus:border-[#A3B18A] focus:bg-[#F8F9F5]',
            rightElement && 'pr-12',
            className,
          )}
          {...props}
        />
        {rightElement ? (
          <div className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer text-[#6B7280]">
            {rightElement}
          </div>
        ) : null}
      </div>
      {helperText ? <span className="text-xs text-[#6B7280]">{helperText}</span> : null}
    </label>
  );
}
