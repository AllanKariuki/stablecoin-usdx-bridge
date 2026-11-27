import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { addDecimal, type Wallet } from '@damp/web-shared/api';
import { cx } from '@damp/web-shared/lib';
import { Callout, Segmented } from '@damp/web-shared/ui';
import { isFrozen } from '../hooks/useWallets';
import { useQuote, type HeldQuote } from '../hooks/useQuote';
import { SECTION_LABEL, currencyMeta, walletSection, type WalletSection } from '../lib/currency';
import CurrencyIcon from './CurrencyIcon';

export type AssetType = 'fiat' | 'crypto' | 'usdx';

export interface PayFromSelection {
  /** The wallet funding the payment; unset means the automatic wallet for the payment currency. */
  sourceWalletId?: string;
  /** Cross-currency legs: the pinned source amount and the quote that names the rate. */
  sourceAmount?: string;
  quoteId?: string;
  /** Carried for the review screen. */
  sourceWallet?: Wallet;
  quote?: HeldQuote;
}

const SECTIONS: Array<{ value: AssetType; label: string }> = [
  { value: 'fiat', label: SECTION_LABEL.fiat },
  { value: 'crypto', label: SECTION_LABEL.crypto },
  { value: 'usdx', label: SECTION_LABEL.usdx },
];

/**
 * "Pay from" — the shared wallet choice behind send and invoice pay. The
 * asset-type toggle filters the caller's wallets; picking one whose
 * currency differs from the target asks for a TO-side quote (debounced,
 * counting down, re-quoted at zero) so the recipient still receives the
 * exact amount. A USD-X source into USD needs no quote (the redemption is
 * 1:1); a USD-X source into anything else converts through the payer's USD
 * wallet — the quote is minted there, and the two-step is explained. A
 * currency in `disabledCurrencies` cannot fund this recipient (rail
 * payouts move one currency) and its wallets are shown greyed with a
 * "Convert first" link.
 */
export default function PayFromPicker({
  wallets,
  targetCurrency,
  targetAmount,
  disabledCurrencies,
  onChange,
}: {
  wallets: Wallet[];
  targetCurrency: string;
  /** A validated decimal string; nothing is quoted without it. */
  targetAmount: string | null;
  disabledCurrencies?: ReadonlySet<string>;
  onChange: (selection: PayFromSelection) => void;
}) {
  const [type, setType] = useState<AssetType>('fiat');
  const [walletId, setWalletId] = useState('');

  const bySection = useMemo(() => {
    const map: Record<AssetType, Wallet[]> = { fiat: [], crypto: [], usdx: [] };
    for (const w of wallets) map[walletSection(w)].push(w);
    return map;
  }, [wallets]);

  // Switching section keeps the selection when it is still visible, so a
  // toggle tap that hides the chosen wallet is a deliberate re-pick.
  useEffect(() => {
    if (!walletId) return;
    if (!bySection[type].some((w) => w.id === walletId)) setWalletId('');
  }, [type, bySection, walletId]);

  const source = walletId ? wallets.find((w) => w.id === walletId) : undefined;

  // The two-step: a USD-X source redeems 1:1 into the payer's USD wallet
  // first, so the FX quote for the second leg is minted from there.
  const twoStep = Boolean(source && source.currency === 'USDX' && targetCurrency !== 'USD');
  const quoteWallet = twoStep ? bySection.fiat.find((w) => w.currency === 'USD' && !isFrozen(w)) ?? wallets.find((w) => w.currency === 'USD') : source;
  const needsQuote = Boolean(source && source.currency !== targetCurrency && !(source.currency === 'USDX' && targetCurrency === 'USD'));

  const { quote, quoting, error, secondsLeft } = useQuote({
    fromWalletId: needsQuote ? quoteWallet?.id ?? null : null,
    toCurrency: targetCurrency,
    amount: targetAmount,
    amountSide: 'TO',
  });

  // Report whatever the parent can submit, every time any leg changes. The
  // quote preview carries its own idempotency key for the review step.
  useEffect(() => {
    onChange({
      sourceWalletId: source?.id,
      sourceAmount: quote?.preview.amount,
      quoteId: quote?.preview.quoteId ?? undefined,
      sourceWallet: source,
      quote: quote ?? undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source?.id, quote]);

  const quotePreview = quote?.preview;
  const total = quotePreview ? addDecimal(quotePreview.amount, quotePreview.fee) : null;

  const walletTone = (w: Wallet): { disabled: boolean; hint?: string } => {
    if (isFrozen(w)) return { disabled: true, hint: 'frozen' };
    if (disabledCurrencies?.has(w.currency)) return { disabled: true, hint: 'convert-first' };
    return { disabled: false };
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="eyebrow">Pay from</p>
        <p className="mt-0.5 text-xs text-muted">Leave unselected to use your automatic {targetCurrency} wallet.</p>
      </div>

      <Segmented
        label="Asset type"
        value={type}
        onChange={setType}
        options={SECTIONS.filter((s) => bySection[s.value].length > 0).map((s) => ({ value: s.value, label: s.label }))}
      />

      <div role="radiogroup" aria-label="Pay from wallet" className="grid gap-2">
        {bySection[type].map((w) => {
          const tone = walletTone(w);
          const selected = w.id === walletId;
          return (
            <button
              key={w.id}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={tone.disabled}
              onClick={() => setWalletId(w.id)}
              className={cx(
                'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
                selected ? 'border-action/50 bg-action-tint' : 'border-line bg-surface hover:border-action/30',
                tone.disabled && 'cursor-not-allowed opacity-55 hover:border-line',
              )}
            >
              <CurrencyIcon currency={w.currency} chain={w.chain} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-navy">
                  {w.label || currencyMeta(w.currency).name}
                  {w.chain ? ` · ${w.chain.toLowerCase()}` : ''}
                </span>
                <span className="block font-mono text-xs text-muted">{w.balance.display}</span>
              </span>
              <span className="text-right text-xs">
                {tone.hint === 'convert-first' ? (
                  <span className="font-semibold text-subtle">
                    Convert first ·{' '}
                    <Link to={`/convert?to=${encodeURIComponent(targetCurrency)}`} className="text-action no-underline hover:underline">
                      open Convert
                    </Link>
                  </span>
                ) : tone.hint === 'frozen' ? (
                  <span className="font-semibold text-subtle">frozen</span>
                ) : (
                  <span className="font-bold text-muted">{w.currency}</span>
                )}
              </span>
            </button>
          );
        })}
        {bySection[type].length === 0 && <p className="rounded-2xl border border-dashed border-line-strong px-3 py-5 text-center text-sm text-subtle">No {SECTION_LABEL[type as WalletSection]} wallets yet.</p>}
      </div>

      {source && source.currency === targetCurrency && (
        <Callout tone="info">Paid directly from this {targetCurrency} wallet — no conversion, no fee.</Callout>
      )}
      {source && source.currency === 'USDX' && targetCurrency === 'USD' && (
        <Callout tone="info">USD-X redeems 1:1 into dollars. Paid once the burn confirms — usually a few minutes.</Callout>
      )}
      {twoStep && !quoteWallet && (
        <Callout tone="warn" title="USD-X converts in two steps">
          USD-X redeems 1:1 into a USD wallet first. You don’t have one yet —{' '}
          <Link to="/convert" className="font-semibold text-warn-ink underline">
            convert first
          </Link>
          , then come back.
        </Callout>
      )}
      {twoStep && quoteWallet && (
        <Callout tone="info" title="USD-X converts in two steps">
          USD-X redeems 1:1 into dollars first, then the dollars convert at the rate below.
        </Callout>
      )}

      {needsQuote && quotePreview && source && quoteWallet && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-3.5 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">You pay</span>
            <span className="font-mono text-base font-bold tabular-nums text-navy">
              {total} {source.currency === 'USDX' ? 'USD-X' : source.currency}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Rate</span>
            <span className="font-mono font-semibold tabular-nums text-ink">
              1 {targetCurrency} = {quotePreview.rate} {quoteWallet.currency}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted">Fee (spread)</span>
            <span className="font-mono tabular-nums text-ink">
              {quotePreview.fee} {quoteWallet.currency}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
            <span className="font-semibold text-ink">Recipient gets</span>
            <span className="font-mono text-base font-bold tabular-nums text-navy">
              {quotePreview.net} {targetCurrency}
            </span>
          </div>
          {secondsLeft !== null && (
            <p className="flex items-center justify-between gap-3 text-xs text-muted">
              <span>Quote expires in</span>
              <span className="font-mono font-semibold tabular-nums" aria-live="polite">
                {secondsLeft}s
              </span>
            </p>
          )}
        </div>
      )}
      {needsQuote && quoting && !error && <p className="text-xs text-muted">Getting a live quote…</p>}
      {needsQuote && error && !quotePreview && <Callout tone="danger">{error}</Callout>}
    </div>
  );
}
