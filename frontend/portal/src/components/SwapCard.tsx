import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownUp, ArrowRight, CheckCircle2 } from 'lucide-react';
import { addDecimal, apiErrorMessage, fxApi, newIdempotencyKey, parseAmountInput, walletsApi, type Currency, type QuotePreview, type Wallet } from '@damp/web-shared/api';
import { useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, CardHeader, EmptyState, IconButton, LinkButton, Select, Skeleton, toast } from '@damp/web-shared/ui';
import { useWallets } from '../hooks/useWallets';
import { currencyMeta } from '../lib/currency';
import CurrencyIcon from './CurrencyIcon';
import OpenUsdxWalletForm from './OpenUsdxWalletForm';

const QUOTE_DEBOUNCE_MS = 500;

const optionLabel = (w: Wallet) => `${currencyMeta(w.currency).glyph} ${w.currency}${w.chain ? ` (${w.chain.toLowerCase()})` : ''} · ${w.label || 'Wallet'} — ${w.balance.display}`;

interface HeldQuote {
  preview: QuotePreview;
  /** One idempotency key per quote — reused on every retry of the same submit. */
  key: string;
}

/**
 * "You pay" / "You receive" — quotes on a 500ms debounce (amount_side FROM),
 * counts down to expires_at and re-quotes at zero, then converts with a
 * per-quote Idempotency-Key. Peg pairs (USD↔USD-X) route through
 * ISSUANCE/REDEMPTION and have no expiry; a missing target wallet is
 * offered inline before anything is quoted.
 */
export default function SwapCard({ initialFromId, initialToCurrency, onChanged }: { initialFromId?: string; initialToCurrency?: string; onChanged?: () => void }) {
  const wallets = useWallets();
  const currencies = useAsync<Currency[]>(() => walletsApi.currencies());
  const list = useMemo(() => wallets.data ?? [], [wallets.data]);

  const [fromId, setFromId] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [quote, setQuote] = useState<HeldQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const requestSeq = useRef(0);

  const from = list.find((w) => w.id === fromId);
  const toWallet = to && !to.startsWith('new:') ? list.find((w) => w.id === to) : undefined;
  const toNewCurrency = to.startsWith('new:') ? to.slice(4) : null;

  // Adopt the first usable wallet once wallets arrive, honouring the
  // Convert-page deep links (?from=<id>, ?to=<CCY>).
  useEffect(() => {
    if (list.length === 0) return;
    const usable = list.filter((w) => w.status.toUpperCase() === 'ACTIVE');
    if (fromId && !list.some((w) => w.id === fromId)) return setFromId((usable[0] ?? list[0]).id);
    if (!fromId) {
      const preferred = initialFromId ? list.find((w) => w.id === initialFromId && w.status.toUpperCase() === 'ACTIVE') : undefined;
      setFromId((preferred ?? usable[0] ?? list[0]).id);
    }
    if (!to && initialToCurrency) {
      const held = list.find((w) => w.currency === initialToCurrency && w.id !== fromId);
      setTo(held ? held.id : `new:${initialToCurrency}`);
    }
  }, [list, fromId, to, initialFromId, initialToCurrency]);

  const targetWalletId = toWallet?.id ?? null;

  const parsed = useMemo(() => (from ? parseAmountInput(amount, from.balance.decimals) : ({ ok: false } as const)), [amount, from]);
  const amountOk = parsed.ok ? parsed.value : null;
  const amountError = amount !== '' && !parsed.ok ? (parsed as { ok: false; error: string }).error : undefined;

  // Debounced quoting: any change to the legs or amount re-quotes after a
  // quiet 500ms; responses from older requests are dropped.
  useEffect(() => {
    if (!fromId || !targetWalletId || !amountOk) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    const seq = ++requestSeq.current;
    setQuote(null);
    setQuoteError(null);
    setQuoting(true);
    const timer = window.setTimeout(() => {
      fxApi
        .quote({ fromWalletId: fromId, toWalletId: targetWalletId, amount: amountOk, amountSide: 'FROM' })
        .then(
          (preview) => {
            if (seq !== requestSeq.current) return;
            setQuote({ preview, key: newIdempotencyKey() });
          },
          (err) => seq === requestSeq.current && setQuoteError(apiErrorMessage(err)),
        )
        .finally(() => seq === requestSeq.current && setQuoting(false));
    }, QUOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [fromId, targetWalletId, amountOk]);

  const expiresAt = quote?.preview.expiresAt ? new Date(quote.preview.expiresAt).getTime() : null;
  const secondsLeft = expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));

  // Tick every second for the countdown; at zero the quote is stale — re-quote.
  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);
  useEffect(() => {
    if (secondsLeft !== null && secondsLeft <= 0 && quote && !quoting) {
      setQuote(null);
      setNow(Date.now());
      // Bump the legs so the quote effect fires again for the same input.
      requestSeq.current += 1;
      const refresh = async () => {
        try {
          const preview = await fxApi.quote({ fromWalletId: fromId, toWalletId: targetWalletId as string, amount: amountOk as string, amountSide: 'FROM' });
          setQuote({ preview, key: newIdempotencyKey() });
        } catch (err) {
          setQuoteError(apiErrorMessage(err));
        }
      };
      void refresh();
    }
  }, [secondsLeft, quote, quoting, fromId, targetWalletId, amountOk]);

  const addTargetWallet = async () => {
    if (!toNewCurrency || toNewCurrency === 'USDX') return;
    setAdding(true);
    setAddError(null);
    try {
      const w = await walletsApi.createWallet({ currency: toNewCurrency });
      setTo(w.id);
      wallets.reload();
      onChanged?.();
    } catch (err) {
      setAddError(apiErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const convert = async () => {
    if (!quote || !targetWalletId || !amountOk) return;
    setConverting(true);
    setConvertError(null);
    try {
      const result = await fxApi.convert(
        { fromWalletId: fromId, toWalletId: targetWalletId, amount: quote.preview.amount, quoteId: quote.preview.quoteId ?? undefined },
        quote.key,
      );
      const routeNote = result.route === 'ISSUANCE' ? 'USD-X will arrive once the mint is final on chain.' : result.route === 'REDEMPTION' ? 'Dollars are released once the burn is final on chain.' : '';
      toast(<span>Converted. {routeNote}</span>);
      setAmount('');
      setQuote(null);
      setConvertError(null);
      wallets.reload();
      onChanged?.();
    } catch (err) {
      setConvertError(apiErrorMessage(err));
    } finally {
      setConverting(false);
    }
  };

  const heldCurrencies = useMemo(() => new Set(list.map((w) => w.currency)), [list]);
  const addable = (currencies.data ?? []).filter((c) => !heldCurrencies.has(c.code));
  const toOptions: Array<{ value: string; label: string; disabled?: boolean }> = [
    ...list.filter((w) => w.id !== fromId).map((w) => ({ value: w.id, label: optionLabel(w), disabled: w.status.toUpperCase() === 'FROZEN' })),
    ...addable.map((c) => ({ value: `new:${c.code}`, label: `${currencyMeta(c.code).glyph} ${c.code} — new wallet` })),
  ];

  const swapSides = () => {
    if (!toWallet) return;
    setFromId(toWallet.id);
    setTo(fromId);
    setQuote(null);
  };

  const quotePreview = quote?.preview;
  const total = quotePreview ? addDecimal(quotePreview.amount, quotePreview.fee) : null;
  const peg = quotePreview?.route === 'ISSUANCE' || quotePreview?.route === 'REDEMPTION';

  if (wallets.loading && !wallets.data) {
    return (
      <Card>
        <Skeleton className="w-28" />
        <Skeleton className="mt-4 h-10 w-full" />
        <Skeleton className="mt-3 h-10 w-full" />
        <Skeleton className="mt-6 h-11 w-full" />
      </Card>
    );
  }

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Swap" description={peg ? 'The USD-X peg is 1:1 — issued or redeemed through the ledger.' : 'Convert between your wallets at a live rate.'} />
      {list.length === 0 ? (
        <EmptyState title="No wallets yet" action={<LinkButton to="/move/deposit">Make your first deposit</LinkButton>}>
          A wallet opens the first time money arrives in a currency.
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-3.5">
            <p className="eyebrow">You pay</p>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="swap-from">Pay from</label>
                <Select id="swap-from" className="border-0 bg-transparent p-0 pl-1 shadow-none focus:ring-0" value={fromId} onChange={(e) => (setFromId(e.target.value), setQuote(null))}>
                  <option value="" disabled>
                    Choose a wallet
                  </option>
                  {list.map((w) => (
                    <option key={w.id} value={w.id} disabled={w.status.toUpperCase() === 'FROZEN'}>
                      {optionLabel(w)}
                      {w.status.toUpperCase() === 'FROZEN' ? ' (frozen)' : ''}
                    </option>
                  ))}
                </Select>
              </span>
              {from && <CurrencyIcon currency={from.currency} chain={from.chain} size="sm" />}
            </div>
            <AmountInput currency={from?.currency ?? ''} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="You pay" className="bg-surface" />
          </div>

          <div className="-my-1 flex justify-center">
            <IconButton label="Swap direction" onClick={swapSides} disabled={!toWallet} className="rounded-full border border-line bg-surface shadow-card">
              <ArrowDownUp className="size-4" aria-hidden />
            </IconButton>
          </div>

          <div className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-3.5">
            <p className="eyebrow">You receive</p>
            <div className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <label className="sr-only" htmlFor="swap-to">Receive in</label>
                <Select id="swap-to" className="border-0 bg-transparent p-0 pl-1 shadow-none focus:ring-0" value={to} onChange={(e) => (setTo(e.target.value), setQuote(null))}>
                  <option value="" disabled>
                    Choose a wallet or currency
                  </option>
                  {toOptions.map((o) => (
                    <option key={o.value} value={o.value} disabled={o.disabled}>
                      {o.label}
                      {o.disabled ? ' (frozen)' : ''}
                    </option>
                  ))}
                </Select>
              </span>
              {toWallet ? <CurrencyIcon currency={toWallet.currency} chain={toWallet.chain} size="sm" /> : toNewCurrency ? <CurrencyIcon currency={toNewCurrency} size="sm" /> : null}
            </div>

            {toNewCurrency && (
              <div className="flex flex-col gap-2">
                {toNewCurrency === 'USDX' ? (
                  <OpenUsdxWalletForm
                    compact
                    onOpened={(w) => {
                      setTo(w.id);
                      wallets.reload();
                      onChanged?.();
                    }}
                  />
                ) : (
                  <div className="flex flex-col gap-2">
                    <Button variant="secondary" size="sm" icon={<CheckCircle2 className="size-4" aria-hidden />} onClick={addTargetWallet} loading={adding}>
                      Add {toNewCurrency} wallet
                    </Button>
                    {addError && <Callout tone="danger">{addError}</Callout>}
                  </div>
                )}
              </div>
            )}
          </div>

          {amountError && <Callout tone="warn">{amountError}</Callout>}

          {peg && quotePreview && (
            <Callout tone="info" title={quotePreview.route === 'ISSUANCE' ? 'Issue USD-X' : 'Redeem to dollars'}>
              {quotePreview.route === 'ISSUANCE'
                ? 'Your dollars are reserved on the ledger now; USD-X arrives once the mint is final on chain.'
                : 'Your USD-X is burned on chain first; the dollars are released once the burn is final.'}
            </Callout>
          )}

          {quotePreview && toWallet && from && (
            <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3.5 text-[13px]">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Price</span>
                <span className="font-mono font-semibold tabular-nums text-ink">
                  1 {toWallet.currency} = {quotePreview.rate} {from.currency}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Fee (spread)</span>
                <span className="font-mono tabular-nums text-ink">
                  {quotePreview.fee} {from.currency}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Total</span>
                <span className="font-mono font-semibold tabular-nums text-ink">
                  {total} {from.currency}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                <span className="font-semibold text-ink">You receive</span>
                <span className="font-mono text-base font-bold tabular-nums text-navy">
                  {quotePreview.net} {toWallet.currency}
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

          {quoting && !quoteError && <p className="text-xs text-muted">Getting a live quote…</p>}
          {quoteError && !peg && <Callout tone="danger">{quoteError}</Callout>}
          {convertError && <Callout tone="danger">{convertError}</Callout>}
          {fromId && targetWalletId && amountOk && !quote && !quoting && !quoteError && !toNewCurrency && (
            <p className="text-xs text-muted">Enter an amount to see a live quote.</p>
          )}

          <Button size="lg" iconRight={<ArrowRight className="size-4" aria-hidden />} onClick={convert} loading={converting} disabled={!quotePreview || !targetWalletId || secondsLeft === 0} className="mt-1">
            Convert now
          </Button>
        </div>
      )}
    </Card>
  );
}
