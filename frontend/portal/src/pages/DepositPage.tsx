import { useMemo, useState } from 'react';
import { ArrowRight, Plus } from 'lucide-react';
import { apiErrorMessage, newIdempotencyKey, parseAmountInput, walletsApi } from '@damp/web-shared/api';
import { paymentsApi, type PaymentIntent } from '@damp/web-shared/api/payments';
import { useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, Field, Input, KeyValueList, LinkButton, PageHeader, Select, SkeletonRows } from '@damp/web-shared/ui';
import IntentStatus from '../components/IntentStatus';
import MethodPicker from '../components/MethodPicker';
import MoveNav from '../components/MoveNav';
import Stepper from '../components/Stepper';
import WalletRadio from '../components/WalletRadio';
import { isFrozen, useWallets } from '../hooks/useWallets';
import { DEPOSIT_METHODS, type MoveMethod } from '../lib/move';
import { isKenyanMobile } from '../lib/phone';

const STEPS = ['Method', 'Details', 'Confirm', 'Status'] as const;

/**
 * Add money: choose M-Pesa or a bank, pick the wallet it lands in, confirm,
 * then watch the intent. Nothing is booked to the wallet by the click — the
 * rail has to confirm the money moved (an STK prompt approved, a bank
 * transfer received) before core-ledger credits anything, so the status
 * step polls rather than showing a receipt.
 */
export default function DepositPage() {
  const wallets = useWallets();
  const accounts = useAsync(() => paymentsApi.bankAccounts(), []);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [method, setMethod] = useState<MoveMethod['value']>('mpesa');
  const [walletId, setWalletId] = useState('');
  const [amount, setAmount] = useState('');
  const [phone, setPhone] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [errors, setErrors] = useState<{ amount?: string; phone?: string; bank?: string }>({});
  const [key, setKey] = useState<string | null>(null);
  const [intent, setIntent] = useState<PaymentIntent | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const def = DEPOSIT_METHODS.find((m) => m.value === method)!;
  const eligible = useMemo(
    () => (wallets.data ?? []).filter((w) => def.currencies.includes(w.currency) && !isFrozen(w)),
    [wallets.data, def],
  );
  const wallet = eligible.find((w) => w.id === walletId);
  const banks = (accounts.data ?? []).filter((a) => wallet && a.currency === wallet.currency && a.status.toUpperCase() !== 'REMOVED');
  const bank = banks.find((a) => a.id === bankAccountId);

  const pickMethod = (m: MoveMethod['value']) => {
    setMethod(m);
    setWalletId('');
    setBankAccountId('');
  };

  const addWallet = async (currency: string) => {
    setAdding(true);
    setSubmitError(null);
    try {
      const w = await walletsApi.createWallet({ currency });
      wallets.reload();
      setWalletId(w.id);
    } catch (err) {
      setSubmitError(apiErrorMessage(err));
    } finally {
      setAdding(false);
    }
  };

  const toConfirm = () => {
    const next: typeof errors = {};
    const parsed = parseAmountInput(amount, wallet?.balance.decimals ?? 2);
    if (!parsed.ok) next.amount = parsed.error;
    if (method === 'mpesa' && !isKenyanMobile(phone)) next.phone = 'Enter a Safaricom number like 2547XXXXXXXX.';
    if (method === 'bank' && !bank) next.bank = 'Choose the bank account to pull from.';
    setErrors(next);
    if (Object.keys(next).length || !parsed.ok) return;
    setAmount(parsed.value);
    setKey(newIdempotencyKey());
    setSubmitError(null);
    setStep(3);
  };

  const confirm = async () => {
    if (!wallet || !key) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await paymentsApi.createIntent(
        {
          direction: 'DEPOSIT',
          amount,
          currency: wallet.currency,
          // Same-currency source picks which wallet the deposit lands in.
          sourceWalletId: wallet.id,
          ...(method === 'mpesa' ? { phoneNumber: phone.trim() } : { bankAccountId }),
        },
        key,
      );
      setIntent(created);
      setStep(4);
    } catch (err) {
      setSubmitError(apiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const restart = () => {
    setIntent(null);
    setKey(null);
    setAmount('');
    setStep(1);
  };

  return (
    <>
      <PageHeader eyebrow="Move money" title="Add money" description="Fund a wallet from M-Pesa or a linked bank account." />
      <MoveNav />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,600px)_1fr]">
        <Card>
          <Stepper steps={STEPS} step={step} />

          {step === 1 && (
            <div className="flex flex-col gap-4">
              <MethodPicker methods={DEPOSIT_METHODS} value={method} onChange={pickMethod} />
              <Button size="lg" onClick={() => setStep(2)} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                Continue
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-4">
              {wallets.loading ? (
                <SkeletonRows rows={3} />
              ) : (
                <WalletRadio
                  label="Into wallet"
                  wallets={eligible}
                  value={walletId}
                  onChange={(id) => (setWalletId(id), setBankAccountId(''))}
                  empty={
                    <div className="flex flex-wrap gap-2">
                      {def.currencies.map((c) => (
                        <Button key={c} variant="secondary" size="sm" loading={adding} onClick={() => addWallet(c)} icon={<Plus className="size-4" aria-hidden />}>
                          Add {c} wallet
                        </Button>
                      ))}
                    </div>
                  }
                />
              )}
              <Field label="Amount" error={errors.amount}>
                <AmountInput currency={wallet?.currency ?? def.currencies[0]} value={amount} onChange={(e) => setAmount(e.target.value)} />
              </Field>
              {method === 'mpesa' ? (
                <Field label="M-Pesa number" error={errors.phone} hint="We’ll send an approval prompt to this phone.">
                  <Input inputMode="tel" placeholder="2547XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </Field>
              ) : (
                <Field label="From bank account" error={errors.bank}>
                  <Select value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)} disabled={!wallet}>
                    <option value="">{!wallet ? 'Choose a wallet first' : banks.length ? 'Choose an account' : `No ${wallet.currency} accounts linked`}</option>
                    {banks.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.bankName} {a.accountNumberMasked}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              {method === 'bank' && wallet && banks.length === 0 && (
                <LinkButton to="/payments/banks" variant="ghost" size="sm">
                  Link a bank account
                </LinkButton>
              )}
              {submitError && <Callout tone="danger">{submitError}</Callout>}
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep(1)}>
                  Back
                </Button>
                <Button onClick={toConfirm} disabled={!wallet} iconRight={<ArrowRight className="size-4" aria-hidden />}>
                  Review
                </Button>
              </div>
            </div>
          )}

          {step === 3 && wallet && (
            <div className="flex flex-col gap-4">
              <h2 className="text-lg font-extrabold tracking-tight text-navy">Check and confirm</h2>
              <KeyValueList
                items={[
                  { label: 'Method', value: def.label },
                  { label: 'Amount', value: <span className="font-mono font-semibold">{amount} {wallet.currency}</span> },
                  { label: 'Into', value: `${wallet.label || wallet.currency} · ${wallet.balance.display}` },
                  method === 'mpesa' ? { label: 'M-Pesa number', value: phone.trim() } : { label: 'From', value: `${bank?.bankName} ${bank?.accountNumberMasked}` },
                ]}
              />
              <Callout tone="info">
                {method === 'mpesa'
                  ? 'You’ll get a prompt on your phone. Your wallet is credited once you approve it and M-Pesa confirms.'
                  : 'Your wallet is credited once the bank confirms the transfer arrived.'}
              </Callout>
              {submitError && <Callout tone="danger">{submitError}</Callout>}
              <div className="flex justify-between gap-2">
                <Button variant="secondary" onClick={() => setStep(2)} disabled={submitting}>
                  Back
                </Button>
                <Button onClick={confirm} loading={submitting}>
                  Confirm deposit
                </Button>
              </div>
            </div>
          )}

          {step === 4 && intent && (
            <IntentStatus intent={intent} successTitle="Money added" successBody="Your wallet has been credited." onRetry={restart} />
          )}
        </Card>
        <aside className="reveal flex flex-col gap-4">
          <Callout tone="info" title="Nothing moves twice">
            Each confirmation carries a one-time key. If your connection drops and you confirm again, we return the original deposit instead of starting a new one.
          </Callout>
        </aside>
      </div>
    </>
  );
}
