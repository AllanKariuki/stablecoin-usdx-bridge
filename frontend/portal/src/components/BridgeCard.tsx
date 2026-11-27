import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import { apiErrorMessage, ledgerApi, newIdempotencyKey, parseAmountInput, type SagaTransfer, type Wallet } from '@damp/web-shared/api';
import { AmountInput, Button, Callout, Card, CardHeader, Field, KeyValueList } from '@damp/web-shared/ui';
import OpenUsdxWalletForm from './OpenUsdxWalletForm';
import WalletSelect from './WalletSelect';
import SagaTimeline from './SagaTimeline';
import { POLL_INTERVAL_MS } from './IssueRedeemForm';

const CHAIN_LABEL: Record<string, string> = { ETHEREUM: 'Ethereum', SOLANA: 'Solana' };
const chainLabel = (chain?: string) => CHAIN_LABEL[chain?.toUpperCase() ?? ''] ?? chain?.toLowerCase() ?? '';
const otherChain = (chain?: string) => (chain?.toUpperCase() === 'ETHEREUM' ? 'SOLANA' : 'ETHEREUM');

/**
 * "Move between chains" — the caller's own USD-X between their ETHEREUM and
 * SOLANA wallets. The destination is always the *other* chain; when it has
 * no wallet yet, the open-wallet step is shown first. One Idempotency-Key is
 * minted per review, and the bridge saga is followed until it is terminal.
 */
export default function BridgeCard({ wallets, onChanged }: { wallets: Wallet[]; onChanged?: () => void }) {
  const usdx = useMemo(() => wallets.filter((w) => w.currency === 'USDX'), [wallets]);
  const [fromWalletId, setFromWalletId] = useState(() => usdx[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const [review, setReview] = useState<{ amount: string; key: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [correlationId, setCorrelationId] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<SagaTransfer | null>(null);

  // Wallets can arrive after first render; adopt the first once they do.
  useEffect(() => {
    if (!fromWalletId && usdx[0]) setFromWalletId(usdx[0].id);
  }, [usdx, fromWalletId]);

  // Follow the active bridge saga until it is terminal (same pattern as issue/redeem).
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

  const fromWallet = usdx.find((w) => w.id === fromWalletId);
  const destChain = otherChain(fromWallet?.chain);
  const destWallet = usdx.find((w) => w.chain.toUpperCase() === destChain);

  const startReview = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAmountInput(amount, fromWallet?.balance.decimals ?? 6);
    if (!parsed.ok) return setAmountError(parsed.error);
    setAmountError(undefined);
    setError(null);
    setReview({ amount: parsed.value, key: newIdempotencyKey() });
  };

  const confirm = async () => {
    if (!review || !fromWallet || !destWallet) return;
    setSubmitting(true);
    setError(null);
    try {
      const accepted = await ledgerApi.bridge({ fromWalletId: fromWallet.id, toWalletId: destWallet.id, amount: review.amount }, review.key);
      setTransfer(null);
      setCorrelationId(accepted.correlationId);
      setReview(null);
      setAmount('');
      onChanged?.();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  // Opening the first USD-X wallet is IssueRedeemForm's job on this page.
  if (usdx.length === 0) return null;

  // The destination chain has no wallet yet: open one there before anything else.
  if (!destWallet) {
    return (
      <Card>
        <CardHeader title="Move between chains" description="Move USD-X to a different chain — it is burned on one and minted on the other." />
        <Callout tone="info" title={`Open a USD-X wallet on ${chainLabel(destChain)}`}>
          You have USD-X on {chainLabel(fromWallet?.chain)}, but not on {chainLabel(destChain)}. Open one there first.
        </Callout>
        <div className="mt-4">
          <OpenUsdxWalletForm chain={destChain} lockChain onOpened={() => onChanged?.()} />
        </div>
      </Card>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
      <Card>
        <CardHeader title="Move between chains" description="Your USD-X is burned on one chain and minted on the other — never on both at once." />
        {review ? (
          <div className="flex flex-col gap-4">
            <h2 className="text-lg font-extrabold tracking-tight text-navy">Check and confirm</h2>
            <KeyValueList
              items={[
                { label: 'Move from', value: `${fromWallet?.label || 'USD-X'} · ${chainLabel(fromWallet?.chain)}` },
                { label: 'Move to', value: `${destWallet.label || 'USD-X'} · ${chainLabel(destChain)}` },
                { label: 'Amount', value: <span className="font-mono font-semibold">{review.amount} USD-X</span> },
              ]}
            />
            <Callout tone="info">
              USD-X is burned on {chainLabel(fromWallet?.chain)} first, then minted on {chainLabel(destChain)}. You can leave this page.
            </Callout>
            {error && <Callout tone="danger">{error}</Callout>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setReview(null)} disabled={submitting}>
                Back
              </Button>
              <Button onClick={confirm} loading={submitting}>
                Move USD-X
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={startReview} className="flex flex-col gap-4" noValidate>
            <WalletSelect label="Move from (USD-X wallet)" wallets={usdx} value={fromWalletId} onChange={setFromWalletId} />
            <Field label="Amount" error={amountError} hint="The amount of USD-X to move to the other chain.">
              <AmountInput currency="USDX" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Callout tone="info">Destination: {chainLabel(destChain)}</Callout>
            <Button type="submit" size="lg" disabled={!fromWalletId} iconRight={<ArrowRight className="size-4" aria-hidden />}>
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
            <ArrowLeftRight className="size-8 text-cyan" aria-hidden />
            <h2 className="text-lg font-extrabold">Why move between chains?</h2>
            <p className="text-sm leading-relaxed text-on-navy-muted">
              The same USD-X is only ever on one chain. Moving it burns the amount on the source chain and mints it again on the destination, with each
              step tracked here and linked to the block explorer.
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
