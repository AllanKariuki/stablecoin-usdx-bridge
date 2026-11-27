import type { ReactNode } from 'react';
import type { Wallet } from '@damp/web-shared/api';
import { cx } from '@damp/web-shared/lib';
import { currencyMeta } from '../lib/currency';
import { isFrozen } from '../hooks/useWallets';
import CurrencyIcon from './CurrencyIcon';

/**
 * Pick one wallet as a radio list, balance shown. Frozen wallets render but
 * aren't selectable, matching WalletSelect's rule. `empty` is rendered in
 * place of the list when there are no wallets — the pages put their
 * "Add <CCY> wallet" action there.
 */
export default function WalletRadio({
  label,
  wallets,
  value,
  onChange,
  empty,
}: {
  label: string;
  wallets: Wallet[];
  value: string;
  onChange: (id: string) => void;
  empty?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="eyebrow">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid gap-2">
        {wallets.map((w) => {
          const frozen = isFrozen(w);
          const selected = w.id === value;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={frozen}
              onClick={() => onChange(w.id)}
              className={cx(
                'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                selected ? 'border-action/50 bg-action-tint' : 'border-line bg-surface hover:border-action/30',
                frozen && 'cursor-not-allowed opacity-55 hover:border-line',
              )}
            >
              <CurrencyIcon currency={w.currency} chain={w.chain} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy">{w.label || currencyMeta(w.currency).name}</span>
                <span className="block font-mono text-xs text-muted">{w.balance.display}</span>
              </span>
              <span className="text-right text-xs font-bold text-muted">
                {w.currency}
                {frozen ? ' · frozen' : ''}
              </span>
            </button>
          );
        })}
        {wallets.length === 0 && empty}
      </div>
    </div>
  );
}
