import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowRight, Coins } from 'lucide-react';
import { apiErrorMessage, ledgerApi, newIdempotencyKey, parseAmountInput, type SagaTransfer, type Wallet } from '@damp/web-shared/api';
import { useAuth } from '@damp/web-shared/auth';
import { AmountInput, Button, Callout, Card, Field, KeyValueList, Tabs } from '@damp/web-shared/ui';
import OpenUsdxWalletForm from './OpenUsdxWalletForm';
import WalletSelect from './WalletSelect';
import SagaTimeline from './SagaTimeline';

/** Sepolia finality is ~15 minutes; polling faster than this buys nothing. */
export const POLL_INTERVAL_MS = 5000;

type Mode = 'issue' | 'redeem';

/**
 * USD → USD-X on chain and back (P2's browser half). Pessimistic throughout:
 * the amount is reviewed before anything is sent, one Idempotency-Key is
 * minted per review so a double click can't issue twice, and the saga is
 * followed until it's terminal.
 */
export default function IssueRedeemForm({ wallets, onChanged }: { wallets: Wallet[]; onChanged?: () => void }) {
  const { can } = useAuth();
  const fiat = useMemo(() => wallets.filter((w) => w.currency === 'USD'), [wallets]);
  const usdx = useMemo(() => wallets.filter((w) => w.currency === 'USDX'), [wallets]);

  const [chosenMode, setMode] = useState<Mode>('issue');
  // Permissions can arrive after first render; fall back to whichever side the user may use.
  const mode: Mode = chosenMode === 'issue' && !can('issuance:create') && can('redemption:create') ? 'redeem' : chosenMode;
  const [fiatWalletId, setFiatWalletId] = useState(fiat[0]?.id ?? '');
  const [usdxWalletId, setUsdxWalletId] = useState(usdx[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const [review, setReview] = useState<{ amount: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<SagaTransfer | null>(null);

  // Wallets arrive asynchronously; adopt the first of each once they do.
  useEffect(() => {
    if (!fiatWalletId && fiat[0]) setFiatWalletId(fiat[0].id);
    if (!usdxWalletId && usdx[0]) setUsdxWalletId(usdx[0].id);
  }, [fiat, usdx, fiatWalletId, usdxWalletId]);

  // Follow the active saga until it is terminal.
  useEffect(() => {
    if (!correlationId) return;
    let live = true;
    let timer: number | undefined;
    const poll = () =>
      ledgerApi.sagaTransfer(correlationId).then(
        (t) => {
          if (!live) return;
          setTransfer(t);
          if (t.terminal) onChanged?.();
          else timer = window.setTimeout(poll, POLL_INTERVAL_MS);
        },
        () => live && (timer = window.setTimeout(poll, POLL_INTERVAL_MS * 2)),
      );
    poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [correlationId, onChanged]);

  const startReview = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAmountInput(amount, 2);
    if (!parsed.ok) return setAmountError(parsed.error);
    setAmountError(undefined);
    setError(null);
    setReview({ amount: parsed.value, key: newIdempotencyKey() });
  };

  const confirm = async () => {
    if (!review) return;
    setSubmitting(true);
    setError(null);
    try {
      const accepted =
        mode === 'issue'
          ? await ledgerApi.issue({ fiatWalletId, usdxWalletId, amount: review.amount }, review.key)
          : await ledgerApi.redeem({ usdxWalletId, fiatWalletId, amount: review.amount }, review.key);
      setTransfer(null);
      setCorrelationId(accepted.correlationId);
      setReview(null);
      setAmount('');
      // The journal entry is already posted; show the balance it moved.
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (usdx.length === 0) return <OpenUsdxWalletForm onOpened={(w) => (setUsdxWalletId(w.id), onChanged?.())} />;

  const tabs = [
    ...(can('issuance:create') ? [{ value: 'issue' as const, label: 'Issue' }] : []),
    ...(can('redemption:create') ? [{ value: 'redeem' as const, label: 'Redeem' }] : []),
  ];
  const from = mode === 'issue' ? wallets.find((w) => w.id === fiatWalletId) : wallets.find((w) => w.id === usdxWalletId);
  const to = mode === 'issue' ? wallets.find((w) => w.id === usdxWalletId) : wallets.find((w) => w.id === fiatWalletId);

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Card>
        <Tabs
          value={mode}
          onChange={(m) => {
            setMode(m);
            setReview(null);
            setError(null);
          }}
          tabs={tabs}
        />
        {review ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-extrabold tracking-tight text-navy">Check and confirm</h2>
            <KeyValueList
              items={[
                { label: mode === 'issue' ? 'Pay from' : 'Redeem from', value: from ? `${from.label || from.currency} · ${from.balance.display}` : '—' },
                { label: 'Receive in', value: to ? `${to.label || to.currency}${to.chain ? ` (${to.chain.toLowerCase()})` : ''}` : '—' },
                { label: 'Amount', value: <span className="font-mono font-semibold">{review.amount} {mode === 'issue' ? 'USD → USD-X' : 'USD-X → USD'}</span> },
              ]}
            />
            <Callout tone="info">
              {mode === 'issue'
                ? 'Dollars are reserved on the ledger now; USD-X arrives once the mint is final on chain. You can leave this page.'
                : 'USD-X is burned on chain first; dollars are released once the burn is final.'}
            </Callout>
            {error && <Callout tone="danger">{error}</Callout>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setReview(null)} disabled={submitting}>
                Back
              </Button>
              <Button onClick={confirm} loading={submitting}>
                {mode === 'issue' ? 'Issue USD-X' : 'Redeem USD-X'}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={startReview} className="flex flex-col gap-4" noValidate>
            <WalletSelect label={mode === 'issue' ? 'Pay from (USD)' : 'Release dollars to'} wallets={fiat} value={fiatWalletId} onChange={setFiatWalletId} />
            <WalletSelect label={mode === 'issue' ? 'Receive USD-X in' : 'Redeem from (USD-X)'} wallets={usdx} value={usdxWalletId} onChange={setUsdxWalletId} />
            <Field label="Amount" error={amountError} hint="One USD-X for every dollar.">
              <AmountInput currency={mode === 'issue' ? 'USD' : 'USDX'} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            {fiat.length === 0 && <Callout tone="warn">You need a USD wallet to {mode}. Make a deposit first.</Callout>}
            <Button type="submit" size="lg" disabled={!fiatWalletId || !usdxWalletId} iconRight={<ArrowRight className="size-4" aria-hidden />}>
              Review
            </Button>
          </form>
        )}
      </Card>

      <div>
        {transfer ? (
          <SagaTimeline transfer={transfer} />
        ) : correlationId ? (
          <Card className="flex items-center gap-3 text-sm text-muted">Looking up the transfer…</Card>
        ) : (
          <Card className="flex h-full flex-col justify-center gap-3 bg-navy text-white" padded>
            <Coins className="size-8 text-cyan" aria-hidden />
            <h2 className="text-lg font-extrabold">How USD-X works</h2>
            <p className="text-sm leading-relaxed text-on-navy-muted">
              Every USD-X is backed by a dollar held in reserve. Issuing reserves your dollars on the ledger and mints the same amount on chain;
              redeeming burns it and gives the dollars back. Each step is shown here as it happens, with a link to the block explorer.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}

