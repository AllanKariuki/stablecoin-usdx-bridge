import { cloneElement, isValidElement, useId, type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from '../lib/cx';

const control =
  'w-full min-h-12 rounded-control border bg-surface px-3.5 text-[15px] text-ink placeholder:text-subtle transition-colors focus:outline-none focus:border-action focus:ring-3 focus:ring-action/20 disabled:bg-canvas disabled:text-subtle';

const border = (invalid?: boolean) => (invalid ? 'border-warn' : 'border-line-strong');

/**
 * Label + control + hint + error, with the ids wired so the error is the
 * control's aria-describedby (WCAG: errors associated with their field).
 */
export function Field({
  label,
  hint,
  error,
  children,
  className,
  optional,
}: {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactElement<{ id?: string; 'aria-describedby'?: string; 'aria-invalid'?: boolean }>;
  className?: string;
  optional?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const control = isValidElement(children)
    ? cloneElement(children, {
        id: children.props.id ?? id,
        'aria-describedby': [hintId, errorId].filter(Boolean).join(' ') || undefined,
        'aria-invalid': error ? true : undefined,
      })
    : children;
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={children.props.id ?? id} className="text-[13px] font-bold text-ink">
        {label}
        {optional && <span className="ml-1 font-medium text-subtle">(optional)</span>}
      </label>
      {control}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-semibold text-warn-ink" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function Input({ className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }) {
  return <input className={cx(control, border(invalid ?? rest['aria-invalid'] === true), className)} {...rest} />;
}

export function Select({ className, invalid, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { invalid?: boolean }) {
  return (
    <select className={cx(control, border(invalid ?? rest['aria-invalid'] === true), 'appearance-none bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10', className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2356627A' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, invalid, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }) {
  return <textarea className={cx(control, border(invalid ?? rest['aria-invalid'] === true), 'py-3 min-h-24', className)} {...rest} />;
}

export function Checkbox({ label, className, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className={cx('inline-flex cursor-pointer items-center gap-2.5 text-sm text-neutral-ink', className)}>
      <input type="checkbox" className="size-4.5 accent-[#1463d6]" {...rest} />
      {label}
    </label>
  );
}

/**
 * Amount entry: a text input (never type=number — it parses to a float and
 * mangles decimals) with the currency as a fixed suffix. Validate with
 * parseAmountInput from @damp/web-shared/api.
 */
export function AmountInput({ currency, className, invalid, ...rest }: InputHTMLAttributes<HTMLInputElement> & { currency: string; invalid?: boolean }) {
  return (
    <div className={cx('relative', className)}>
      <input
        inputMode="decimal"
        autoComplete="off"
        placeholder="0.00"
        className={cx(control, border(invalid ?? rest['aria-invalid'] === true), 'pr-20 font-mono text-lg font-semibold tabular-nums')}
        {...rest}
      />
      <span className="pointer-events-none absolute inset-y-0 right-3.5 flex items-center text-sm font-bold text-muted">{currency}</span>
    </div>
  );
}

/** Segmented control for 2–5 mutually exclusive options. */
export function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: ReactNode }>; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap gap-1 rounded-control border border-line bg-surface p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            'min-h-9 rounded-[9px] px-3 text-[13px] font-semibold transition-colors cursor-pointer',
            value === o.value ? 'bg-navy text-white' : 'text-neutral-ink hover:bg-neutral-tint',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
