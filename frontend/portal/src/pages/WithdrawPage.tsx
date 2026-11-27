import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { apiErrorMessage, compareDecimal, newIdempotencyKey, parseAmountInput } from '@damp/web-shared/api';
import { paymentsApi, type PaymentIntent } from '@damp/web-shared/api/payments';
import { useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, Field, Input, KeyValueList, LinkButton, Modal, PageHeader, Select, SkeletonRows } from '@damp/web-shared/ui';
import IntentStatus from '../components/IntentStatus';
import MethodPicker from '../components/MethodPicker';
import MoveNav from '../components/MoveNav';
import Stepper from '../components/Stepper';
import WalletRadio from '../components/WalletRadio';
import { isFrozen, useWallets } from '../hooks/useWallets';
import { WITHDRAW_METHODS, type MoveMethod } from '../lib/move';
import { isKenyanMobile } from '../lib/phone';

const STEPS = ['From', 'Method', 'Amount', 'Confirm', 'Status'] as const;

/** Fiat payout currencies: crypto and USD-X leave through conversion or redemption, never a bank rail. */
const PAYOUT_CURRENCIES = new Set(WITHDRAW_METHODS.flatMap((m) => m.currencies));

/**
 * Take money out to M-Pesa or a verified bank account. A payout is the one
 * money movement that leaves the platform for good, so it asks twice: the
 * review step, then a confirmation that makes the customer type the amount
 * again. There is no PIN backend — retyping is the deliberate-act check the
 * damp-ui design's "security" step stands for, and a mistyped amount stops
 * here rather than at the bank.
 */
export default function WithdrawPage() {
  const wallets = useWallets();
  const accounts = useAsync(() => paymentsApi.bankAccounts(), []);
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [walletId, setWalletId] = useState('');
  const [method, setMethod] = useState<MoveMethod['value']>('bank');
  const [phone, setPhone] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; phone?: string; bank?: string }>({});
  const [confirming, setConfirming] = useState(false);
  const [retyped, setRetyped] = useState('');
  const [retypeError, setRetypeError] = useState<string>();
  const [key, setKey] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const sources = useMemo(() => (wallets.data ?? []).filter((w) => PAYOUT_CURRENCIES.has(w.currency)), [wallets.data]);
  const wallet = sources.find((w) => w.id === walletId);
  const methodDef = WITHDRAW_METHODS.find((m) => m.value === method)!;
  const verified = (accounts.data ?? []).filter((a) => wallet && a.currency === wallet.currency && a.status.toUpperCase() === 'VERIFIED');
  const bank = verified.find((a) => a.id === bankAccountId);

  const unsupported = (m: MoveMethod) => (wallet && !m.currencies.includes(wallet.currency) ? `Not available for ${wallet.currency}` : undefined);

  const toConfirm = () => {
    if (!wallet) return;
    const next: typeof errors = {};
    const parsed = parseAmountInput(amount, wallet.balance.decimals);
    if (!parsed.ok) next.amount = parsed.error;
    else if (compareDecimal(parsed.value, wallet.balance.amount) > 0) next.amount = `You have ${wallet.balance.display} available.`;
    if (method === 'mpesa' && !isKenyanMobile(phone)) next.phone = 'Enter a Safaricom number like 2547XXXXXXXX.';
    if (method === 'bank' && !bank) next.bank = 'Choose a verified bank account.';
    setErrors(next);
    if (Object.keys(next).length || !parsed.ok) return;
    setAmount(parsed.value);
    setKey(newIdempotencyKey());
    setSubmitError(null);
    setStep(4);
  };

  const submit = async () => {
    if (!wallet || !key) return;
    const parsed = parseAmountInput(retyped, wallet.balance.decimals);
    if (!parsed.ok || compareDecimal(parsed.value, amount) !== 0) {
      setRetypeError('That doesn’t match the amount you’re withdrawing.');
      return;
    }
    setRetypeError(undefined);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await paymentsApi.createIntent(
        {
          direction: 'WITHDRAWAL',
          amount,
          currency: wallet.currency,
          sourceWalletId: wallet.id,
          ...(method === 'mpesa' ? { phoneNumber: phone.trim() } : { bankAccountId }),
        },
        key,
      );
      setIntent(created);
      setConfirming(false);
      setStep(5);
      wallets.reload();
    } catch (err) {
      setSubmitError(apiErrorMessage(err));
      setConfirming(false);
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setIntent(null);
    setKey(null);
    setAmount('');
    setRetyped('');
    setStep(1);
  };

  return (
    <>
      <PageHeader eyebrow="Move money" title="Withdraw" description="Pay out to M-Pesa or a verified bank account." />
      <MoveNav />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,600px)_1fr]">
        <Card>
          <Stepper steps={STEPS} step={step} />

          {step === 1 && (
            <div className="flex flex-col gap-4">
              {wallets.loading ? (
                <SkeletonRows rows={3} />
              ) : (
                <WalletRadio
                  label="Withdraw from"
                  wallets={sources}
                  value={walletId}
                  onChange={setWalletId}
                  empty={<p className="text-sm text-muted">You have no fiat wallet to withdraw from. Convert crypto to a fiat currency first.</p>}
                />
              )}
              <Button size="lg" disabled={!wallet || isFrozen(wallet)} onClick={() => (setMethod(wallet?.currency === 'KES' ? method : 'bank'), setStep(2))} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Continue
              </Button>
            </div>
          )}

          {step === 2 && wallet && (
            <div className="flex flex-col gap-4">
              <MethodPicker methods={WITHDRAW_METHODS} value={method} onChange={setMethod} disabledHint={unsupported} />
              {method === 'mpesa' ? (
                <Field label="M-Pesa number" error={errors.phone}>
                  <Input inputMode="tel" placeholder="2547XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              ) : (
                <>
                  <Field label="To bank account" error={errors.bank} hint="Only verified accounts can receive payouts.">
                    <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                      <option value="">{verified.length ? 'Choose an account' : `No verified ${wallet.currency} accounts`}</option>
                      {verified.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.bankName} {a.accountNumberMasked}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  {verified.length === 0 && (
                    <LinkButton to="/payments/banks" variant="ghost" size="sm">
                      Add a bank account
                    </LinkButton>
                  )}
                </>
              )}
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={() => setStep(3)} disabled={method === 'mpesa' ? !phone.trim() : !bankAccountId} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Continue
                </Button>
              </div>
            </div>
          )}

          {step === 3 && wallet && (
            <div className="flex flex-col gap-4">
              <Field label="Amount" error={errors.amount ?? errors.phone ?? errors.bank} hint={`Available: ${wallet.balance.display}`}>
                <AmountInput currency={wallet.currency} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep(2)}>
                  Back
                </Button>
                <Button onClick={toConfirm} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Review
                </Button>
              </div>
            </div>
          )}

          {step === 4 && wallet && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold tracking-tight text-navy">Check and confirm</h2>
              <KeyValueList
                items={[
                  { label: 'From', value: `${wallet.label || wallet.currency} · ${wallet.balance.display}` },
                  { label: 'Amount', value: <span className="font-mono font-semibold">{amount} {wallet.currency}</span> },
                  method === 'mpesa'
                    ? { label: 'To M-Pesa', value: phone.trim() }
                    : { label: 'To', value: `${bank?.bankName} ${bank?.accountNumberMasked}` },
                  { label: 'Method', value: methodDef.label },
                ]}
              />
              <Callout tone="warn">A payout leaves the platform. Once your provider accepts it, it can’t be recalled from here.</Callout>
              {submitError && <Callout tone="danger">{submitError}</Callout>}
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep(3)}>
                  Back
                </Button>
                <Button onClick={() => (setRetyped(''), setRetypeError(undefined), setConfirming(true))}>Withdraw</Button>
              </div>
            </div>
          )}

          {step === 5 && intent && (
            <IntentStatus intent={intent} successTitle="Withdrawal sent" successBody="Your provider has confirmed the payout." onRetry={restart} />
          )}
        </Card>
        <aside className="reveal flex flex-col gap-4">
          <Callout tone="info" title="Holding crypto?">
            Convert it to a fiat wallet first, then withdraw. <LinkButton to="/convert" variant="ghost" size="sm">Convert</LinkButton>
          </Callout>
        </aside>
      </div>

      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Confirm your withdrawal"
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} loading={submitting}>
              Confirm withdrawal
            </Button>
          </>
        }
      >
        <Field label={`Type the amount (${wallet?.currency ?? ''}) to confirm`} error={retypeError}>
          <Input inputMode="decimal" aria-label="Retype amount" value={retyped} onChange={(e) => setRetyped(e.target.value)} />
        </Field>
      </Modal>
    </>
  );
}
