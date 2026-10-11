// Form primitives — Input, Textarea, Select. One treatment everywhere.
import { cn } from '../../utils/helpers';

const FIELD_BASE =
  'w-full rounded-xl border border-line bg-paper px-3.5 text-[15px] text-ink transition-colors duration-150 placeholder:text-faint hover:border-sage/70 focus:border-sage focus:outline-none focus:ring-4 focus:ring-brand/10 disabled:cursor-not-allowed disabled:bg-canvas';

export function Input({ label, hint, error, className, id, ...props }) {
  const fieldId = id || props.name;
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <input
        id={fieldId}
        aria-invalid={Boolean(error)}
        className={cn(FIELD_BASE, 'h-11', error && 'border-danger focus:ring-danger/10')}
        {...props}
      />
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

export function Textarea({ label, hint, error, className, rows = 6, id, ...props }) {
  const fieldId = id || props.name;
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <textarea
        id={fieldId}
        rows={rows}
        aria-invalid={Boolean(error)}
        className={cn(FIELD_BASE, 'resize-y py-3 leading-relaxed', error && 'border-danger')}
        {...props}
      />
      {error ? (
        <span className="text-xs text-danger">{error}</span>
      ) : hint ? (
        <span className="text-xs text-muted">{hint}</span>
      ) : null}
    </div>
  );
}

export function Select({ label, hint, options = [], className, id, ...props }) {
  const fieldId = id || props.name;
  return (
    <div className={cn('flex w-full flex-col gap-1.5', className)}>
      {label ? (
        <label htmlFor={fieldId} className="text-sm font-medium text-ink">
          {label}
        </label>
      ) : null}
      <select
        id={fieldId}
        className={cn(
          FIELD_BASE,
          'h-11 appearance-none bg-[url(\'data:image/svg+xml;charset=utf-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2212%22 height=%228%22 viewBox=%220 0 12 8%22%3E%3Cpath fill=%22%236b7280%22 d=%22M1.41.59 0 2l6 6 6-6-1.41-1.41L6 5.17z%22/%3E%3C/svg%3E\')] bg-[position:right_1rem_center] bg-no-repeat pr-10',
        )}
        {...props}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </div>
  );
}
