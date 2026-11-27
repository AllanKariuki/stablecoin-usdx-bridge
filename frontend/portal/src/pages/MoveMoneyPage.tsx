import { useEffect, useState, type FormEvent } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Wallet as WalletIcon } from 'lucide-react';
import { apiErrorMessage, ledgerApi, newIdempotencyKey, parseAmountInput, type Transaction } from '@damp/web-shared/api';
import { paymentsApi, type PaymentIntent } from '@damp/web-shared/api/payments';
import { formatDateTime, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, EmptyState, ErrorState, Field, Input, KeyValueList, LinkButton, MonoRef, MoneyText, PageHeader, Select, SkeletonRows, StatusBadge } from '@damp/web-shared/ui';
import MoveNav from '../components/MoveNav';
import WalletSelect from '../components/WalletSelect';
import { useWallets } from '../hooks/useWallets';

type Kind = 'deposit' | 'withdraw' | 'transfer';

const COPY: Record<Kind, { title: string; description: string; cta: string }> = {
  deposit: { title: 'Deposit', description: 'Add money from your bank or mobile money.', cta: 'Deposit' },
  withdraw: { title: 'Withdraw', description: 'Take money out to a verified bank or mobile money account.', cta: 'Withdraw' },
  transfer: { title: 'Transfer between your wallets', description: 'Move money from one of your wallets to another in the same currency.', cta: 'Transfer' },
};

const CURRENCIES = ['USD', 'EUR', 'KES'];

type Outcome = { kind: 'transaction'; tx: Transaction } | { kind: 'intent'; intent: PaymentIntent };

type Step = { name: 'form' } | { name: 'review'; amount: string; key: string } | { name: 'done'; outcome: Outcome };

/**
 * Deposit / withdraw / transfer. Three steps, all pessimistic: a form, a
 * review that mints the Idempotency-Key (reused by any retry of the same
 * submit), and a receipt.
 *
 * Only a transfer is booked straight to the ledger. Deposits and withdrawals
 * go through services/payments' payment intents, so a rail has to confirm the
 * fiat moved before core-ledger is asked to book anything — the ledger wallet
 * is not touched by the click alone. That is also why a withdrawal needs a
 * verified bank account: paying out to an account nobody has proved they
 * control is the mistake the PENDING/VERIFIED split exists to prevent.
 */
export default function MoveMoneyPage() {
  const { kind = 'deposit' } = useParams();
  const wallets = useWallets();
  const accounts = useAsync(
    () => (kind === 'deposit' || kind === 'withdraw' ? paymentsApi.bankAccounts() : Promise.resolve([])),
    [kind],
  );
  const [walletId, setWalletId] = useState('');
  const [toWalletId, setToWalletId] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [bankAccountId, setBankAccountId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string>();
  const [destinationError, setDestinationError] = useState<string>();
  const [step, setStep] = useState<Step>({ name: 'form' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setStep({ name: 'form' });
    setError(null);
    setAmountError(undefined);
    setDestinationError(undefined);
    setToWalletId('');
  }, [kind]);

  if (!['deposit', 'withdraw', 'transfer'].includes(kind)) return <Navigate to="/move/deposit" replace />;
  const k = kind as Kind;
  const isPayment = k === 'deposit' || k === 'withdraw';
  const list = wallets.data ?? [];
  const from = list.find((w) => w.id === walletId);
  const to = list.find((w) => w.id === toWalletId);
  const targets = list.filter((w) => w.id !== walletId && (!from || w.currency === from.currency));
  const verified = (accounts.data ?? []).filter((a) => a.status.toUpperCase() === 'VERIFIED');
  const account = verified.find((a) => a.id === bankAccountId);

  const review = (e: FormEvent) => {
    e.preventDefault();
    const parsed = parseAmountInput(amount, isPayment ? 2 : from?.balance.decimals ?? 2);
    if (!parsed.ok) return setAmountError(parsed.error);
    setAmountError(undefined);
    setDestinationError(undefined);
    if (k === 'withdraw' && !bankAccountId && !phoneNumber.trim()) {
      return setDestinationError('Choose a verified account or enter a mobile number.');
    }
    setError(null);
    setStep({ name: 'review', amount: parsed.value, key: newIdempotencyKey() });
  };

  const confirm = async () => {
    if (step.name !== 'review') return;
    setSubmitting(true);
    setError(null);
    try {
      const description = note.trim() || undefined;
      if (isPayment) {
        const intent = await paymentsApi.createIntent(
          {
            direction: k === 'deposit' ? 'DEPOSIT' : 'WITHDRAWAL',
            amount: step.amount,
            currency,
            bankAccountId: bankAccountId || undefined,
            phoneNumber: phoneNumber.trim() || undefined,
            description,
          },
          step.key,
        );
        setStep({ name: 'done', outcome: { kind: 'intent', intent } });
      } else {
        const tx = await ledgerApi.transfer(
          { fromWalletId: walletId, toWalletId, amount: step.amount, reference: description },
          step.key,
        );
        setStep({ name: 'done', outcome: { kind: 'transaction', tx } });
      }
      setAmount('');
      setNote('');
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
      <MoveNav />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,560px)_1fr]">
        <Card>
          {k === 'transfer' && wallets.loading ? (
            <SkeletonRows rows={3} />
          ) : k === 'transfer' && wallets.error ? (
            <ErrorState message={apiErrorMessage(wallets.error)} onRetry={wallets.reload} />
          ) : k === 'transfer' && list.length === 0 ? (
            <EmptyState icon={<WalletIcon className="size-6" aria-hidden />} title="You don’t have a wallet yet">
              Wallets are opened for you during onboarding. If you’ve just been verified, give it a minute and refresh.
            </EmptyState>
          ) : step.name === 'done' ? (
            <div className="flex flex-col items-start gap-4 animate-rise" role="status">
              <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
                <CheckCircle2 className="size-7" aria-hidden />
              </span>
              <h2 className="text-2xl font-extrabold tracking-tight text-navy">
                {step.outcome.kind === 'intent' ? `${COPY[k].cta} started` : `${COPY[k].cta} posted`}
              </h2>
              {step.outcome.kind === 'intent' ? (
                <>
                  <KeyValueList
                    className="w-full"
                    items={[
                      { label: 'Status', value: <StatusBadge status={step.outcome.intent.status} /> },
                      { label: 'Amount', value: <MoneyText money={step.outcome.intent.amount} /> },
                      { label: 'Reference', value: <MonoRef value={step.outcome.intent.id} /> },
                      { label: 'Started', value: formatDateTime(step.outcome.intent.createdAt) },
                    ]}
                  />
                  {step.outcome.intent.customerAction && (
                    <Callout tone="warn" title="Your action needed">
                      {step.outcome.intent.customerAction}
                    </Callout>
                  )}
                  {step.outcome.intent.failureReason && <Callout tone="danger">{step.outcome.intent.failureReason}</Callout>}
                  <p className="text-sm text-muted">We’ll notify you when it completes.</p>
                </>
              ) : (
                <KeyValueList
                  className="w-full"
                  items={[
                    { label: 'Status', value: <StatusBadge status={step.outcome.tx.status} /> },
                    { label: 'Reference', value: <MonoRef value={step.outcome.tx.id} /> },
                    { label: 'Posted', value: formatDateTime(step.outcome.tx.createdAt) },
                  ]}
                />
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setStep({ name: 'form' })}>
                  Make another
                </Button>
                {step.outcome.kind === 'transaction' ? (
                  <LinkButton to={`/wallets/${walletId}`}>View wallet</LinkButton>
                ) : (
                  <LinkButton to="/payments">View payment activity</LinkButton>
                )}
              </div>
            </div>
          ) : step.name === 'review' ? (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold tracking-tight text-navy">Check and confirm</h2>
              <KeyValueList
                items={
                  isPayment
                    ? [
                        { label: 'Type', value: COPY[k].title },
                        { label: 'Amount', value: <span className="font-mono font-semibold">{step.amount} {currency}</span> },
                        ...(account ? [{ label: k === 'deposit' ? 'From' : 'To', value: `${account.bankName} ${account.accountNumberMasked}` }] : []),
                        ...(phoneNumber.trim() ? [{ label: 'Mobile number', value: phoneNumber.trim() }] : []),
                        ...(note.trim() ? [{ label: 'Description', value: note.trim() }] : []),
                      ]
                    : [
                        { label: 'From', value: from ? `${from.label || from.currency} · ${from.balance.display}` : '—' },
                        { label: 'To', value: to ? `${to.label || to.currency} · ${to.balance.display}` : '—' },
                        { label: 'Amount', value: <span className="font-mono font-semibold">{step.amount} {from?.currency}</span> },
                        ...(note.trim() ? [{ label: 'Note', value: note.trim() }] : []),
                      ]
                }
              />
              <Callout tone="info">
                {isPayment
                  ? 'Your bank or mobile money provider will ask you to approve this. Nothing is booked to your wallet until the rail confirms the money moved.'
                  : 'The ledger posts this immediately. It can’t be undone from here — a mistaken posting is corrected with a reversal by our team.'}
              </Callout>
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
              {isPayment ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                    <Field label="Amount" error={amountError}>
                      <AmountInput currency={currency} value={amount} onChange={(e) => setAmount(e.target.value)} />
                    </Field>
                    <Field label="Currency">
                      <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                        {CURRENCIES.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </Select>
                    </Field>
                  </div>
                  <Field
                    label={k === 'deposit' ? 'From bank account' : 'To bank account'}
                    error={destinationError}
                    optional={k === 'deposit'}
                    hint="Only verified accounts can be used."
                  >
                    <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                      <option value="">{verified.length ? 'Choose an account' : 'No verified accounts'}</option>
                      {verified.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} {a.accountNumberMasked} ({a.currency})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label="Or mobile money number" optional hint="For M-Pesa, in international format, e.g. 2547XXXXXXXX.">
                    <Input inputMode="tel" value={phoneNumber} onChange={(e) => setPhoneNumber(e.target.value)} />
                  </Field>
                  <Field label="Description" optional hint="Shown on your statement.">
                    <Input value={note} maxLength={140} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </>
              ) : (
                <>
                  <WalletSelect label="From" wallets={list} value={walletId} onChange={(id) => (setWalletId(id), setToWalletId(''))} />
                  <WalletSelect
                    label="To"
                    wallets={targets}
                    value={toWalletId}
                    onChange={setToWalletId}
                    hint={from && targets.length === 0 ? `You have no other ${from.currency} wallet.` : 'Transfers stay in one currency.'}
                  />
                  <Field label="Amount" error={amountError}>
                    <AmountInput currency={from?.currency ?? '—'} value={amount} onChange={(e) => setAmount(e.target.value)} />
                  </Field>
                  <Field label="Note" optional hint="Shown on your statement.">
                    <Input value={note} maxLength={120} onChange={(e) => setNote(e.target.value)} />
                  </Field>
                </>
              )}
              <Button
                type="submit"
                size="lg"
                disabled={k === 'transfer' && (!walletId || !toWalletId)}
                iconRight={<ArrowRight className="size-4" aria-hidden />}
              >
                Review
              </Button>
            </form>
          )}
        </Card>

        <aside className="reveal flex flex-col gap-4">
          <Card className="bg-navy text-white">
            <h2 className="text-base font-bold">Sending to someone else?</h2>
            <p className="mt-1 text-sm leading-relaxed text-on-navy-muted">Pay a saved payee, send an invoice or withdraw to a linked bank from Payments.</p>
            <LinkButton to="/payments" variant="secondary" size="sm" className="mt-4">
              Go to Payments
            </LinkButton>
          </Card>
          <Callout tone="info" title="Nothing moves twice">
            Each confirmation carries a one-time key. If your connection drops and you press confirm again, we recognise the repeat and return the original result.
          </Callout>
        </aside>
      </div>
    </>
  );
}
