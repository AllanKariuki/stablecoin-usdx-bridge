import { CheckCircle2, CircleDashed, XCircle } from 'lucide-react';
import { cx } from '@damp/web-shared/lib';

/**
 * A reconciliation leg's verdict. Three-valued on purpose: null is "not
 * evaluated", which is neither a pass nor a fail and must never look green.
 */
export function LegVerdict({ ok, compact }: { ok: boolean | null | undefined; compact?: boolean }) {
  const state = ok === true ? 'pass' : ok === false ? 'fail' : 'unknown';
  const meta = {
    pass: { icon: CheckCircle2, label: 'Pass', cls: 'bg-cyan-tint text-cyan-ink' },
    fail: { icon: XCircle, label: 'Break', cls: 'bg-warn-tint text-warn-ink' },
    unknown: { icon: CircleDashed, label: 'Not evaluated', cls: 'bg-neutral-tint text-neutral-ink' },
  }[state];
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full font-bold whitespace-nowrap', compact ? 'px-2 py-0.5 text-[11px]' : 'px-3 py-1 text-xs', meta.cls)}>
      <meta.icon className={compact ? 'size-3.5' : 'size-4'} aria-hidden />
      {meta.label}
    </span>
  );
}

export const LEGS = [
  { key: 'LEG_A', field: 'leg_a_ok', name: 'Leg A', title: 'On-chain supply', description: 'USD-X supply on Ethereum + Solana equals ledger issued plus in-transit.' },
  { key: 'LEG_B', field: 'leg_b_ok', name: 'Leg B', title: 'Reserve backing', description: 'Ledger reserve backing covers every USD-X issued.' },
  { key: 'LEG_C', field: 'leg_c_ok', name: 'Leg C', title: 'Custodian bank', description: 'Custodian bank balance is at least the ledger’s reserve cash.' },
] as const;
