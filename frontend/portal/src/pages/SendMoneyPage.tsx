import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, Landmark, Phone, Plus } from 'lucide-react';
import { addDecimal, apiErrorMessage, newIdempotencyKey, parseAmountInput, walletsApi, type Currency } from '@damp/web-shared/api';
import { paymentsApi, type BankAccount, type Beneficiary, type PaymentIntent } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { cx, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, Field, KeyValueList, LinkButton, MonoRef, PageHeader, Select, SkeletonRows, StatusBadge, Tabs } from '@damp/web-shared/ui';
import AddPayeeModal from '../components/AddPayeeModal';
import ConvertingTracker from '../components/ConvertingTracker';
import PayFromPicker, { type PayFromSelection } from '../components/PayFromPicker';
import { useWallets } from '../hooks/useWallets';
import { currencyMeta } from '../lib/currency';

type RecipientTab = 'wallet' | 'bank' | 'mpesa';

/** The person/account money is going to. `rail` picks the intent direction:
 * in-platform payees are TRANSFER, everything that leaves the platform is a
 * WITHDRAWAL. A bank recipient is either one of the caller's verified accounts
 * or a saved BANK beneficiary; M-Pesa is a saved MOBILE beneficiary. */
type Recipient =
  | { rail: 'wallet'; beneficiary: Beneficiary }
  | { rail: 'bank'; account?: BankAccount; beneficiary?: Beneficiary; currency: string }
  | { rail: 'mpesa'; beneficiary: Beneficiary; currency: string };

const STEPS = ['Recipient', 'Amount', 'Review', 'Result'] as const;

/** Theme-true avatar palette; the payee id hashes into it, never the name order. */
const AVATAR_COLORS = [
  { bg: '#1463D6', fg: '#FFFFFF' },
  { bg: '#0E2463', fg: '#1FD3E6' },
  { bg: '#0B6B78', fg: '#FFFFFF' },
  { bg: '#B4530A', fg: '#FFFFFF' },
  { bg: '#6D4ED8', fg: '#FFFFFF' },
  { bg: '#0E9F8E', fg: '#FFFFFF' },
];

const avatarColor = (id: string) => {
  let hash = 0;
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const initials = (name: string) =>
  name
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

const currencyLabel = (code: string) => (code === 'USDX' ? 'USD-X' : code);

function Stepper({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <ol className="mb-6 flex list-none items-center gap-1 overflow-x-auto p-0">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3 | 4;
        const done = n < step;
        const active = n === step;
        return (
          <li key={label} className="flex items-center">
            {i > 0 && <span aria-hidden className="mx-2 h-px w-5 shrink-0 bg-line-strong" />}
            <span className="flex items-center gap-2">
              <span
                aria-hidden
                className={cx(
                  'grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold',
                  done ? 'bg-action text-white' : active ? 'bg-navy text-white' : 'border border-line-strong bg-canvas text-subtle',
                )}
              >
                {done ? <Check className="size-3.5" aria-hidden /> : n}
              </span>
              <span className={cx('whitespace-nowrap text-[13px] font-semibold', active ? 'text-navy' : done ? 'text-ink' : 'text-subtle')}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A selectable recipient row, with the same selected styling as the wallet pickers. */
function PickCard({
  selected,
  onClick,
  avatar,
  title,
  subtitle,
  badge,
}: {
  selected: boolean;
  onClick: () => void;
  avatar: ReactNode;
  title: string;
  subtitle: string;
  badge: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cx(
        'flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors',
        selected ? 'border-action/50 bg-action-tint' : 'border-line bg-surface hover:border-action/30',
      )}
    >
      {avatar}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-navy">{title}</span>
        <span className="block truncate font-mono text-xs text-muted">{subtitle}</span>
      </span>
      <span className="shrink-0 text-xs font-bold text-muted">{badge}</span>
    </button>
  );
}

/** A coloured initials avatar (matches QuickSend) or a Landmark mark for a bank account. */
function RecipientAvatar({ beneficiary }: { beneficiary: Beneficiary }) {
  const c = avatarColor(beneficiary.id);
  return (
    <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full text-sm font-extrabold" style={{ backgroundColor: c.bg, color: c.fg }}>
      {initials(beneficiary.name)}
    </span>
  );
}

/**
 * Send money in four steps: pick a recipient (in-platform, bank or M-Pesa),
 * enter an amount and choose which wallet pays, check the summary, then
 * submit a payment intent. Cross-currency sources ride a TO-side quote from
 * the shared PayFromPicker; a USD-X source books as a CONVERTING intent that
 * the result step polls to settlement.
 */
export default function SendMoneyPage() {
  const [params] = useSearchParams();
  const preselectedPayee = params.get('payee');

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [tab, setTab] = useState<RecipientTab>('wallet');
  const [recipient, setRecipient] = useState<Recipient | null>(null);
  const [walletCurrency, setWalletCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState<PayFromSelection>({});
  const [adding, setAdding] = useState(false);

  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<PaymentIntent | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const wallets = useWallets();
  const currencies = useAsync<Currency[]>(() => walletsApi.currencies(), []);
  const beneficiaries = useAsync(() => paymentsApi.beneficiaries(), []);
  const accounts = useAsync(() => paymentsApi.bankAccounts(), []);

  // A payee deep-linked from QuickSend (?payee=<id>) is pre-selected and the
  // wizard skips straight to the amount — "one tap away". Only WALLET payees
  // qualify; the others live behind their own tabs.
  const [didPreselect, setDidPreselect] = useState(false);
  useEffect(() => {
    if (!preselectedPayee || !beneficiaries.data || didPreselect) return;
    const payee = beneficiaries.data.find((b) => b.id === preselectedPayee && b.kind === 'WALLET');
    if (payee) {
      setRecipient({ rail: 'wallet', beneficiary: payee });
      setStep(2);
    }
    setDidPreselect(true);
  }, [preselectedPayee, beneficiaries.data, didPreselect]);

  const list = useMemo(() => wallets.data ?? [], [wallets.data]);
  const walletPayees = useMemo(() => (beneficiaries.data ?? []).filter((b) => b.kind === 'WALLET'), [beneficiaries.data]);
  const bankBeneficiaries = useMemo(() => (beneficiaries.data ?? []).filter((b) => b.kind === 'BANK'), [beneficiaries.data]);
  const mobileBeneficiaries = useMemo(() => (beneficiaries.data ?? []).filter((b) => b.kind === 'MOBILE'), [beneficiaries.data]);
  const verifiedAccounts = useMemo(() => (accounts.data ?? []).filter((a) => a.status.toUpperCase() === 'VERIFIED'), [accounts.data]);

  // In-platform the sender picks the receive currency; bank and M-Pesa rails
  // move exactly one currency, which the recipient already names.
  const receiveCurrency = recipient && recipient.rail !== 'wallet' ? recipient.currency : walletCurrency;

  const currencyDecimals = useMemo(() => currencies.data?.find((c) => c.code === receiveCurrency)?.decimals ?? 2, [currencies.data, receiveCurrency]);
  const parsed = useMemo(() => (amount ? parseAmountInput(amount, currencyDecimals) : ({ ok: false } as const)), [amount, currencyDecimals]);
  const amountOk = parsed.ok ? parsed.value : null;
  const amountError = amount !== '' && !parsed.ok ? (parsed as { ok: false; error: string }).error : undefined;

  // A rail payout (bank/M-Pesa) can only be funded from a wallet holding that
  // currency; every other wallet is shown greyed with a "Convert first" hint.
  const disabledCurrencies = useMemo(() => {
    if (!recipient || recipient.rail === 'wallet') return undefined;
    return new Set(list.map((w) => w.currency).filter((c) => c !== receiveCurrency));
  }, [recipient, list, receiveCurrency]);

  // Cross-currency needs a live quote before we let the user proceed (a
  // USD-X source into USD is the 1:1 redemption — no quote, it books as
  // CONVERTING on the backend).
  const sourceWallet = source.sourceWallet;
  const needsQuote = Boolean(sourceWallet && sourceWallet.currency !== receiveCurrency && !(sourceWallet.currency === 'USDX' && receiveCurrency === 'USD'));
  const quoteReady = !needsQuote || Boolean(source.quoteId);

  const pickRecipient = (next: Recipient) => {
    setRecipient(next);
    setSource({});
  };

  const changeTab = (next: RecipientTab) => {
    setTab(next);
    setRecipient(null);
    setSource({});
  };

  const enterReview = () => {
    setIdempotencyKey(newIdempotencyKey());
    setSubmitError(null);
    setStep(3);
  };

  const submit = async () => {
    if (!recipient || !amountOk || !idempotencyKey) return;
    setSubmitting(true);
    setSubmitError(null);
    setResult(null);
    setStep(4);
    try {
      const intent = await paymentsApi.createIntent(
        {
          direction: recipient.rail === 'wallet' ? 'TRANSFER' : 'WITHDRAWAL',
          amount: amountOk,
          currency: receiveCurrency,
          ...(recipient.rail === 'wallet' ? { beneficiaryId: recipient.beneficiary.id } : {}),
          ...(recipient.rail === 'bank' && recipient.account ? { bankAccountId: recipient.account.id } : {}),
          ...(recipient.rail === 'bank' && recipient.beneficiary ? { beneficiaryId: recipient.beneficiary.id } : {}),
          ...(recipient.rail === 'mpesa' ? { beneficiaryId: recipient.beneficiary.id } : {}),
          sourceWalletId: source.sourceWalletId,
          ...(source.quoteId ? { quoteId: source.quoteId, sourceAmount: source.sourceAmount } : {}),
        },
        idempotencyKey,
      );
      setResult(intent);
    } catch (err) {
      setSubmitError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const reset = () => {
    setStep(1);
    setRecipient(null);
    setAmount('');
    setSource({});
    setResult(null);
    setSubmitError(null);
    setIdempotencyKey(null);
  };

  const crossCurrency = Boolean(sourceWallet && needsQuote && source.quote);
  const quotePreview = source.quote?.preview;
  const youPay = crossCurrency && quotePreview ? addDecimal(quotePreview.amount, quotePreview.fee) : null;
  const recipientName =
    recipient?.rail === 'wallet'
      ? recipient.beneficiary.name
      : recipient?.rail === 'bank'
        ? recipient.account
          ? `${recipient.account.bankName} ${recipient.account.accountNumberMasked}`
          : recipient.beneficiary?.name ?? ''
        : recipient?.beneficiary.name ?? '';

  return (
    <>
      <PageHeader eyebrow="Move money" title="Send money" description="Send to someone on Interlock, a bank account, or M-Pesa — from any wallet you hold." />
      <div className="mx-auto max-w-2xl">
        <Card>
          <Stepper step={step} />

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <Tabs
                value={tab}
                onChange={changeTab}
                tabs={[
                  { value: 'wallet', label: 'On Interlock' },
                  { value: 'bank', label: 'Bank account' },
                  { value: 'mpesa', label: 'M-Pesa' },
                ]}
              />

              {tab === 'wallet' && (
                <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-muted">People and businesses on Interlock.</p>
                    <Can anyOf={['payments:write:own']}>
                      <Button size="sm" variant="secondary" icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
                        Add payee
                      </Button>
                    </Can>
                  </div>
                  <div className="grid gap-2">
                    {walletPayees.map((p) => (
                      <PickCard
                        key={p.id}
                        selected={recipient?.rail === 'wallet' && recipient.beneficiary.id === p.id}
                        onClick={() => pickRecipient({ rail: 'wallet', beneficiary: p })}
                        avatar={<RecipientAvatar beneficiary={p} />}
                        title={p.name}
                        subtitle={p.accountRef}
                        badge={p.currency}
                      />
                    ))}
                    {walletPayees.length === 0 && (
                      <p className="rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-subtle">
                        No Interlock payees yet. Add one to send in a couple of taps.
                      </p>
                    )}
                  </div>
                </>
              )}

              {tab === 'bank' && (
                <div className="grid gap-2">
                  {verifiedAccounts.map((a) => (
                    <PickCard
                      key={a.id}
                      selected={recipient?.rail === 'bank' && recipient.account?.id === a.id}
                      onClick={() => pickRecipient({ rail: 'bank', account: a, currency: a.currency })}
                      avatar={
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-white">
                          <Landmark className="size-4" aria-hidden />
                        </span>
                      }
                      title={a.bankName}
                      subtitle={`${a.accountName} · ${a.accountNumberMasked}`}
                      badge={a.currency}
                    />
                  ))}
                  {bankBeneficiaries.map((b) => (
                    <PickCard
                      key={b.id}
                      selected={recipient?.rail === 'bank' && recipient.beneficiary?.id === b.id}
                      onClick={() => pickRecipient({ rail: 'bank', beneficiary: b, currency: b.currency })}
                      avatar={<RecipientAvatar beneficiary={b} />}
                      title={b.name}
                      subtitle={b.accountRef}
                      badge={b.currency}
                    />
                  ))}
                  {verifiedAccounts.length === 0 && bankBeneficiaries.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-subtle">
                      No verified bank accounts or bank payees yet.
                    </p>
                  )}
                </div>
              )}

              {tab === 'mpesa' && (
                <div className="grid gap-2">
                  {mobileBeneficiaries.map((b) => (
                    <PickCard
                      key={b.id}
                      selected={recipient?.rail === 'mpesa' && recipient.beneficiary.id === b.id}
                      onClick={() => pickRecipient({ rail: 'mpesa', beneficiary: b, currency: b.currency })}
                      avatar={
                        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-navy text-white">
                          <Phone className="size-4" aria-hidden />
                        </span>
                      }
                      title={b.name}
                      subtitle={b.accountRef}
                      badge={b.currency}
                    />
                  ))}
                  {mobileBeneficiaries.length === 0 && (
                    <p className="rounded-2xl border border-dashed border-line-strong px-3 py-6 text-center text-sm text-subtle">
                      No M-Pesa payees yet. Add one in the Payees tab, then come back.
                    </p>
                  )}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={() => setStep(2)} disabled={!recipient}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 2 && recipient && (
            <div className="flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_200px]">
                <Field label="Amount" error={amountError}>
                  <AmountInput currency={receiveCurrency} value={amount} onChange={(e) => setAmount(e.target.value)} aria-label="Amount" />
                </Field>
                {recipient.rail === 'wallet' ? (
                  <Field label="Receive currency">
                    <Select value={receiveCurrency} onChange={(e) => setWalletCurrency(e.target.value)}>
                      {(currencies.data ?? []).map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code} — {c.name}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <Field label="Receive currency">
                    <div className="flex min-h-12 items-center rounded-control border border-line-strong bg-canvas px-3.5 text-[15px] font-semibold text-ink">
                      {currencyLabel(receiveCurrency)} — {currencyMeta(receiveCurrency).name}
                    </div>
                  </Field>
                )}
              </div>

              {wallets.loading && !wallets.data ? (
                <SkeletonRows rows={4} />
              ) : (
                <PayFromPicker
                  key={`${recipient.rail}:${
                    recipient.rail === 'wallet'
                      ? recipient.beneficiary.id
                      : recipient.rail === 'bank'
                        ? recipient.account?.id ?? recipient.beneficiary?.id
                        : recipient.beneficiary.id
                  }`}
                  wallets={list}
                  targetCurrency={receiveCurrency}
                  targetAmount={amountOk}
                  disabledCurrencies={disabledCurrencies}
                  onChange={setSource}
                />
              )}

              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={enterReview} disabled={!amountOk || !quoteReady}>
                  Review
                </Button>
              </div>
            </div>
          )}

          {step === 3 && recipient && amountOk && (
            <div className="flex flex-col gap-4">
              <KeyValueList
                items={[
                  { label: 'To', value: recipientName },
                  { label: 'Amount', value: <span className="font-mono font-semibold">{amountOk} {currencyLabel(receiveCurrency)}</span> },
                  {
                    label: 'Pay from',
                    value: sourceWallet ? `${sourceWallet.label || currencyMeta(sourceWallet.currency).name} · ${currencyLabel(sourceWallet.currency)}${sourceWallet.chain ? ` (${sourceWallet.chain.toLowerCase()})` : ''}` : `Automatic ${currencyLabel(receiveCurrency)} wallet`,
                  },
                ]}
              />

              {crossCurrency && quotePreview && (
                <div className="flex flex-col gap-2 rounded-2xl border border-line bg-canvas p-3.5 text-[13px]">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">You pay</span>
                    <span className="font-mono text-base font-bold tabular-nums text-navy">
                      {youPay} {currencyLabel(sourceWallet!.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Rate</span>
                    <span className="font-mono font-semibold tabular-nums text-ink">
                      1 {currencyLabel(receiveCurrency)} = {quotePreview.rate} {currencyLabel(sourceWallet!.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted">Fee (spread)</span>
                    <span className="font-mono tabular-nums text-ink">
                      {quotePreview.fee} {currencyLabel(sourceWallet!.currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-line pt-2">
                    <span className="font-semibold text-ink">Recipient gets</span>
                    <span className="font-mono text-base font-bold tabular-nums text-navy">
                      {quotePreview.net} {currencyLabel(receiveCurrency)}
                    </span>
                  </div>
                </div>
              )}

              {sourceWallet?.currency === 'USDX' && (
                <Callout tone="info">Paid once the USD-X burn confirms — usually a few minutes.</Callout>
              )}

              <div className="flex items-center justify-between">
                <Button variant="secondary" onClick={() => setStep(2)} disabled={submitting}>
                  Back
                </Button>
                <Button onClick={submit} loading={submitting}>
                  Send now
                </Button>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col gap-4">
              {submitting && !result && !submitError && <SkeletonRows rows={4} />}

              {submitError && !result && (
                <>
                  <Callout tone="danger">{submitError}</Callout>
                  <div className="flex items-center justify-between">
                    <Button variant="secondary" onClick={() => (setStep(2), setSubmitError(null), setIdempotencyKey(null))}>
                      Change amount
                    </Button>
                    <Button onClick={submit}>Try again</Button>
                  </div>
                </>
              )}

              {result && result.status.toUpperCase() === 'CONVERTING' && <ConvertingTracker intent={result} />}

              {result && result.status.toUpperCase() !== 'CONVERTING' && (
                <div className="flex flex-col items-start gap-4 animate-rise" role="status">
                  <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
                    <Check className="size-7" aria-hidden />
                  </span>
                  <h2 className="text-2xl font-extrabold tracking-tight text-navy">Payment sent</h2>
                  <KeyValueList
                    className="w-full"
                    items={[
                      { label: 'To', value: recipientName },
                      { label: 'Status', value: <StatusBadge status={result.status} /> },
                      { label: 'Amount', value: <span className="font-mono font-semibold">{amountOk} {currencyLabel(receiveCurrency)}</span> },
                      { label: 'Reference', value: <MonoRef value={result.id} /> },
                    ]}
                  />
                  {result.customerAction && <Callout tone="warn" title="Your action needed">{result.customerAction}</Callout>}
                  <div className="flex flex-wrap gap-2">
                    <LinkButton to="/payments" variant="secondary">
                      View payment activity
                    </LinkButton>
                    <Button variant="ghost" onClick={reset}>
                      Send another
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <AddPayeeModal
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={(payee) => {
          beneficiaries.reload();
          if (payee.kind === 'WALLET') pickRecipient({ rail: 'wallet', beneficiary: payee });
        }}
      />
    </>
  );
}
