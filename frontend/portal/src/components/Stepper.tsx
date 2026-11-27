import { Check } from 'lucide-react';
import { cx } from '@damp/web-shared/lib';

/**
 * The numbered step header the money wizards share (send, deposit,
 * withdraw). `step` is 1-based; steps before it render as done.
 */
export default function Stepper({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <ol className="mb-6 flex list-none items-center gap-1 overflow-x-auto p-0" aria-label="Progress">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex items-center" aria-current={active ? 'step' : undefined}>
            {i > 0 && <span aria-hidden className="mx-2 h-px w-5 shrink-0 bg-line-strong" />}
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                  done ? 'bg-action text-white' : active ? 'bg-navy text-white' : 'border border-line-strong bg-canvas text-subtle',
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : n}
              </span>
              <span className={cx('whitespace-nowrap text-[13px] font-semibold', active ? 'text-navy' : done ? 'text-ink' : 'text-subtle')}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
