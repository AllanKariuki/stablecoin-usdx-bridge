import { cx } from '@damp/web-shared/lib';
import type { MoveMethod } from '../lib/move';

/**
 * "How do you want to move it" — the method cards that open a deposit or
 * withdrawal. Each card names what it is, one line on how it works and which
 * currencies it supports. `disabledHint` greys a method out with a reason
 * (e.g. M-Pesa can't pay out a non-KES wallet).
 */
export default function MethodPicker({
  methods,
  value,
  onChange,
  disabledHint,
}: {
  methods: MoveMethod[];
  value: MoveMethod['value'];
  onChange: (value: MoveMethod['value']) => void;
  disabledHint?: (m: MoveMethod) => string | undefined;
}) {
  return (
    <div role="radiogroup" aria-label="Method" className="grid gap-2">
      {methods.map((m) => {
        const hint = disabledHint?.(m);
        const disabled = Boolean(hint);
        const selected = m.value === value;
        return (
          <button
            key={m.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(m.value)}
            className={cx(
              'flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors',
              selected ? 'border-action/50 bg-action-tint' : 'border-line bg-surface hover:border-action/30',
              disabled && 'cursor-not-allowed opacity-55 hover:border-line',
            )}
          >
            <span className={cx('grid size-10 shrink-0 place-items-center rounded-[10px]', selected ? 'bg-action text-white' : 'bg-action-tint text-action')}>
              <m.icon className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-navy">{m.label}</span>
              <span className="block text-[13px] leading-snug text-muted">{m.description}</span>
              <span className="mt-1 block text-xs font-semibold text-subtle">{hint ?? `Supports ${m.currencies.join(', ')}`}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
