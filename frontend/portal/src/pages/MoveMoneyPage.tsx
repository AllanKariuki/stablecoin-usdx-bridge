import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Wallet as WalletIcon } from 'lucide-react';
import { apiErrorMessage, ledgerApi, newIdempotencyKey, parseAmountInput, type Transaction } from '@damp/web-shared/api';
import { formatDateTime } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, EmptyState, ErrorState, Field, Input, KeyValueList, LinkButton, MonoRef, NavTabs, PageHeader, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';
import WalletSelect from '../components/WalletSelect';
import { useWallets } from '../hooks/useWallets';

type Kind = 'deposit' | 'withdraw' | 'transfer';

const COPY: Record<Kind, { title: string; description: string; cta: string }> = {
  deposit: { title: 'Deposit', description: 'Add money to one of your wallets.', cta: 'Deposit' },
  withdraw: { title: 'Withdraw', description: 'Take money out of one of your wallets.', cta: 'Withdraw' },
  transfer: { title: 'Transfer between your wallets', description: 'Move money from one of your wallets to another in the same currency.', cta: 'Transfer' },
};

type Step = { name: 'form' } | { name: 'review'; amount: string; key: string } | { name: 'done'; tx: Transaction };

/**
 * Deposit / withdraw / transfer. Three steps, all pessimistic: a form, a
 * review that mints the Idempotency-Key (reused by any retry of the same
 * submit), and a receipt shown only once the ledger has posted.
 */
export default function MoveMoneyPage() {
  const { kind = 'deposit' } = useParams();
  const wallets = useWallets();
  const [walletId, setWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStep({ name: 'form' });
    setError(null);
    setToWalletId('');
  }, [kind]);

  if (!['deposit', 'withdraw', 'transfer'].includes(kind)) return <Navigate to="/move/deposit" replace />;
  const k = kind as Kind;
  const list = wallets.data ?? [];
  const from = list.find((w) => w.id === walletId);
  const to = list.find((w) => w.id === toWalletId);
  const targets = list.filter((w) => w.id !== walletId && (!from || w.currency === from.currency));

  const review = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAmountInput(amount, from?.balance.decimals ?? 2);
    if (!parsed.ok) return setAmountError(parsed.error);
    setAmountError(undefined);
    setError(null);
    setStep({ name: 'review', amount: parsed.value, key: newIdempotencyKey() });
  };

  const confirm = async () => {
    if (step.name !== 'review') return;
    setSubmitting(true);
    setError(null);
    try {
      const ref = reference.trim() || undefined;
      const tx =
        k === 'deposit'
          ? await ledgerApi.deposit({ walletId, amount: step.amount, reference: ref }, step.key)
          : k === 'withdraw'
            ? await ledgerApi.withdraw({ walletId, amount: step.amount, reference: ref }, step.key)
            : await ledgerApi.transfer({ fromWalletId: walletId, toWalletId, amount: step.amount, reference: ref }, step.key);
      setStep({ name: 'done', tx });
      setAmount('');
      setReference('');
      wallets.reload();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <PageHeader eyebrow="Move money" title={COPY[k].title} description={COPY[k].description} />
      <NavTabs
        tabs={[
          { to: '/move/deposit', label: 'Deposit' },
          { to: '/move/withdraw', label: 'Withdraw' },
          { to: '/move/transfer', label: 'Transfer' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Card>
          {wallets.loading ? (
            <SkeletonRows rows={3} />
          ) : wallets.error ? (
            <ErrorState message={apiErrorMessage(wallets.error)} onRetry={wallets.reload} />
          ) : list.length === 0 ? (
            <EmptyState icon={<WalletIcon className="size-6" aria-hidden />} title="You don’t have a wallet yet">
              Wallets are opened for you during onboarding. If you’ve just been verified, give it a minute and refresh.
            </EmptyState>
          ) : step.name === 'done' ? (
            <div className="flex flex-col items-start gap-4 animate-rise" role="status">
              <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
                <CheckCircle2 className="size-7" aria-hidden />
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-navy">{COPY[k].cta} posted</h2>
              <KeyValueList
                className="w-full"
                items={[
                  { label: 'Status', value: <StatusBadge status={step.tx.status} /> },
                  { label: 'Reference', value: <MonoRef value={step.tx.id} /> },
                  { label: 'Posted', value: formatDateTime(step.tx.createdAt) },
                ]}
              />
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setStep({ name: 'form' })}>
                  Make another
                </Button>
                <LinkButton to={`/wallets/${walletId}`}>View wallet</LinkButton>
              </div>
            </div>
          ) : step.name === 'review' ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold tracking-tight text-navy">Check and confirm</h2>
              <KeyValueList
                items={[
                  { label: k === 'deposit' ? 'Into' : 'From', value: from ? `${from.label || from.currency} · ${from.balance.display}` : '—' },
                  ...(k === 'transfer' ? [{ label: 'To', value: to ? `${to.label || to.currency} · ${to.balance.display}` : '—' }] : []),
                  { label: 'Amount', value: <span className="font-mono font-semibold">{step.amount} {from?.currency}</span> },
                  ...(reference.trim() ? [{ label: 'Note', value: reference.trim() }] : []),
                ]}
              />
              <Callout tone="info">The ledger posts this immediately. It can’t be undone from here — a mistaken posting is corrected with a reversal by our team.</Callout>
              {error && <Callout tone="danger">{error}</Callout>}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={() => setStep({ name: 'form' })} disabled={submitting}>
                  Back
                </Button>
                <Button onClick={confirm} loading={submitting}>
                  Confirm {COPY[k].cta.toLowerCase()}
                </Button>
              </div>
            </div>
          ) : (
            <form onSubmit={review} className="flex flex-col gap-4" noValidate>
              <WalletSelect label={k === 'deposit' ? 'Deposit into' : 'From'} wallets={list} value={walletId} onChange={(id) => (setWalletId(id), setToWalletId(''))} />
              {k === 'transfer' && (
                <WalletSelect
                  label="To"
                  wallets={targets}
                  value={toWalletId}
                  onChange={setToWalletId}
                  hint={from && targets.length === 0 ? `You have no other ${from.currency} wallet.` : 'Transfers stay in one currency.'}
                />
              )}
              <Field label="Amount" error={amountError}>
                <AmountInput currency={from?.currency ?? '—'} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <Field label="Note" optional hint="Shown on your statement.">
                <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
              </Field>
              <Button type="submit" size="lg" disabled={!walletId || (k === 'transfer' && !toWalletId)} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Review
              </Button>
            </form>
          )}
        </Card>

        <aside className="flex flex-col gap-4">
          <Card className="bg-navy text-white">
            <h2 className="text-base font-bold">Sending to someone else?</h2>
            <p className="mt-1 text-sm leading-relaxed text-on-navy-muted">Pay a saved payee, send an invoice or withdraw to a linked bank from Payments.</p>
            <LinkButton to="/payments" variant="secondary" size="sm" className="mt-4">
              Go to Payments
            </LinkButton>
          </Card>
          <Callout tone="info" title="Nothing moves twice">
            Each confirmation carries a one-time key. If your connection drops and you press confirm again, the ledger recognises the repeat and returns the original result.
          </Callout>
        </aside>
      </div>
    </>
  );
}
