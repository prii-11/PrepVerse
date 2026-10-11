// ChoiceGroup — compact option selection for interview configuration.
// Text-first, restrained borders; the selected option carries the brand state.
import { cn } from '../../utils/helpers';

// Literal classes only — dynamic construction would break Tailwind scanning.
const COLUMN_CLASSES = { 1: 'grid-cols-1', 2: 'grid-cols-2', 3: 'grid-cols-3' };

export function ChoiceGroup({ label, options, value, onChange, columns = 3, className }) {
  return (
    <fieldset className={cn('min-w-0', className)}>
      {label ? (
        <legend className="mb-2.5 text-sm font-medium text-ink">{label}</legend>
      ) : null}
      <div
        className={cn('grid gap-2', COLUMN_CLASSES[columns] || COLUMN_CLASSES[3])}
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                'rounded-xl border px-4 py-3 text-left text-sm transition-colors duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                selected
                  ? 'border-brand bg-sage-soft/60 text-brand-deep shadow-[inset_0_0_0_1px_rgb(85_107_47/0.35)]'
                  : 'border-line bg-paper text-muted hover:border-sage hover:text-ink',
              )}
            >
              <span className="block font-medium">{option.label}</span>
              {option.hint ? (
                <span className="mt-0.5 block text-xs leading-snug text-muted">{option.hint}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SegmentedControl({ label, options, value, onChange, className }) {
  return (
    <div className={className}>
      {label ? <p className="mb-2.5 text-sm font-medium text-ink">{label}</p> : null}
      <div
        className="inline-flex rounded-xl border border-line bg-canvas p-1"
        role="radiogroup"
        aria-label={label}
      >
        {options.map((option) => {
          const selected = value === option;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(option)}
              className={cn(
                'h-9 min-w-[3rem] rounded-lg px-4 text-sm font-medium transition-all duration-150',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sage',
                selected ? 'bg-paper text-brand-deep shadow-card' : 'text-muted hover:text-ink',
              )}
            >
              {option}
            </button>
          );
        })}
      </div>
    </div>
  );
}
