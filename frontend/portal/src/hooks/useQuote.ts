import { useEffect, useRef, useState } from 'react';
import { apiErrorMessage, fxApi, newIdempotencyKey, type QuotePreview } from '@damp/web-shared/api';

export const QUOTE_DEBOUNCE_MS = 500;

export interface HeldQuote {
  preview: QuotePreview;
  /** One idempotency key per quote — reused on every retry of the same submit. */
  key: string;
}

interface UseQuoteInput {
  /** The wallet funding the conversion. */
  fromWalletId: string | null;
  /** The target as a wallet (Swap) or a currency (pay-from pickers). Exactly one must be set. */
  toWalletId?: string | null;
  toCurrency?: string | null;
  /** A validated decimal string; nothing is quoted without it. */
  amount: string | null;
  amountSide?: 'FROM' | 'TO';
}

/**
 * Live quotes on a 500ms debounce with a countdown to expires_at and an
 * automatic re-quote at zero — extracted from SwapCard so the pay-from
 * pickers get the same behaviour without duplicating it. Responses from
 * older requests are dropped with a sequence counter, and every preview
 * carries a fresh Idempotency-Key. A null expires_at (the USD-X peg
 * previews) means no countdown and no re-quote.
 */
export function useQuote({ fromWalletId, toWalletId, toCurrency, amount, amountSide = 'FROM' }: UseQuoteInput) {
  const [quote, setQuote] = useState<HeldQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const requestSeq = useRef(0);

  const targetReady = Boolean(fromWalletId && (toWalletId || toCurrency) && amount);
  const targetWalletId = toWalletId ?? null;
  const targetCurrency = toCurrency ?? null;

  const request = (): Promise<void> =>
    fxApi
      .quote({
        fromWalletId: fromWalletId as string,
        ...(targetWalletId ? { toWalletId: targetWalletId } : { toCurrency: targetCurrency as string }),
        amount: amount as string,
        amountSide,
      })
      .then((preview) => setQuote({ preview, key: newIdempotencyKey() }))
      .catch((err) => setError(apiErrorMessage(err)));

  // Debounced quoting: any change to the legs or amount re-quotes after a
  // quiet 500ms; responses from older requests are dropped.
  useEffect(() => {
    if (!targetReady) {
      setQuote(null);
      setError(null);
      return;
    }
    const seq = ++requestSeq.current;
    setQuote(null);
    setError(null);
    setQuoting(true);
    const timer = window.setTimeout(() => {
      fxApi
        .quote({
          fromWalletId: fromWalletId as string,
          ...(targetWalletId ? { toWalletId: targetWalletId } : { toCurrency: targetCurrency as string }),
          amount: amount as string,
          amountSide,
        })
        .then(
          (preview) => {
            if (seq !== requestSeq.current) return;
            setQuote({ preview, key: newIdempotencyKey() });
          },
          (err) => seq === requestSeq.current && setError(apiErrorMessage(err)),
        )
        .finally(() => seq === requestSeq.current && setQuoting(false));
    }, QUOTE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fromWalletId, targetWalletId, targetCurrency, amount, amountSide]);

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
      // Bump the sequence so the debounce effect fires again for the same input.
      requestSeq.current += 1;
      void request();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft, quote, quoting]);

  return { quote, quoting, error, secondsLeft };
}
