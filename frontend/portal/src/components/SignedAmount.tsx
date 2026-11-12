import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import type { Money } from '@damp/web-shared/api';
import { isOutgoing } from '../lib/amounts';
import { cx } from '@damp/web-shared/lib';

export default function SignedAmount({ money, direction, className }: { money: Money; direction: string; className?: string }) {
  const out = isOutgoing(money, direction);
  const shown = money.display.replace(/^-/, '');
  return (
    <span className={cx('inline-flex items-center gap-1 text-sm font-semibold tabular-nums whitespace-nowrap', out ? 'text-warn-ink' : 'text-action-ink', className)}>
      {out ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownLeft className="size-3.5" aria-hidden />}
      <span aria-hidden>{out ? '−' : '+'}</span>
      <span>{shown}</span>
      <span className="sr-only">{out ? '(money out)' : '(money in)'}</span>
    </span>
  );
}
