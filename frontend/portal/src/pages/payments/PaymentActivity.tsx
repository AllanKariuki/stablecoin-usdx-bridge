import { useState } from 'react';
import { Plus, Send } from 'lucide-react';
import { apiErrorMessage, newIdempotencyKey, parseAmountInput } from '@damp/web-shared/api';
import { paymentsApi, type IntentDirection, type PaymentIntent } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, CardHeader, ConfirmDialog, DataTable, Field, Input, KeyValueList, Modal, MonoRef, MoneyText, Segmented, Select, StatusBadge } from '@damp/web-shared/ui';

const DIRECTION_LABEL: Record<IntentDirection, string> = { DEPOSIT: 'Deposit', WITHDRAWAL: 'Withdrawal', TRANSFER: 'Payment' };
const CANCELLABLE = new Set(['PENDING', 'REQUIRES_ACTION', 'CREATED']);

export default function PaymentActivity() {
  const intents = useAsync(() => paymentsApi.intents(), []);
  const [creating, setCreating] = useState(false);
  const [cancelling, setCancelling] = useState<PaymentIntent | null>(null);

  return (
    <Card>
      <CardHeader
        title="Payment activity"
        description="Deposits from and withdrawals to your bank or mobile money, and payments to people."
        actions={
          <Can anyOf={['payments:write:own']}>
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              New payment
            </Button>
          </Can>
        }
      />
      <DataTable
        caption="Payment intents"
        rows={intents.data}
        loading={intents.loading}
        error={intents.error ? apiErrorMessage(intents.error) : undefined}
        onRetry={intents.reload}
        rowKey={(i) => i.id}
        empty={{ title: 'No payments yet', body: 'Payments you make or receive through a bank or mobile money appear here.', icon: <Send className="size-6" aria-hidden /> }}
        columns={[
          { key: 'date', header: 'Date', render: (i) => <span className="whitespace-nowrap text-muted">{formatDateTime(i.createdAt)}</span> },
          {
            key: 'what',
            header: 'Payment',
            render: (i) => (
              <div>
                <p className="font-medium text-ink">{i.description || DIRECTION_LABEL[i.direction]}</p>
                <p className="text-xs text-muted">
                  {DIRECTION_LABEL[i.direction]} · {humanize(i.rail)}
                </p>
                {i.customerAction && <p className="mt-1 text-xs font-semibold text-warn-ink">{i.customerAction}</p>}
                {i.failureReason && <p className="mt-1 text-xs text-danger-ink">{i.failureReason}</p>}
              </div>
            ),
          },
          { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          { key: 'ledger', header: 'Ledger ref', hideOnMobile: true, render: (i) => (i.ledgerTxId ? <MonoRef value={i.ledgerTxId} /> : <span className="text-subtle">—</span>) },
          { key: 'amount', header: 'Amount', align: 'right', render: (i) => <MoneyText money={i.amount} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (i) =>
              CANCELLABLE.has(i.status.toUpperCase()) ? (
                <Can anyOf={['payments:write:own']}>
                  <Button size="sm" variant="ghost" onClick={() => setCancelling(i)}>
                    Cancel
                  </Button>
                </Can>
              ) : null,
          },
        ]}
      />
      <NewPaymentModal open={creating} onClose={() => setCreating(false)} onCreated={intents.reload} />
      <ConfirmDialog
        open={cancelling !== null}
        onClose={() => setCancelling(null)}
        title="Cancel this payment?"
        confirmLabel="Cancel payment"
        variant="warn"
        consequence="The payment stops before any money moves. You can start a new one afterwards."
        onConfirm={async () => {
          try {
            await paymentsApi.cancelIntent(cancelling!.id);
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
          intents.reload();
        }}
      >
        {cancelling && <KeyValueList items={[{ label: 'Amount', value: <MoneyText money={cancelling.amount} /> }, { label: 'Reference', value: <MonoRef value={cancelling.id} /> }]} />}
      </ConfirmDialog>
    </Card>
  );
}

function NewPaymentModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [direction, setDirection] = useState<IntentDirection>('DEPOSIT');
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  const [bankAccountId, setBankAccountId] = useState('');
  const [beneficiaryId, setBeneficiaryId] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [review, setReview] = useState<{ amount: string; key: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentIntent | null>(null);
  const accounts = useAsync(() => (open ? paymentsApi.bankAccounts() : Promise.resolve([])), [open]);
  const payees = useAsync(() => (open ? paymentsApi.beneficiaries() : Promise.resolve([])), [open]);
  const verified = (accounts.data ?? []).filter((a) => a.status.toUpperCase() === 'VERIFIED');

  const close = () => {
    setReview(null);
    setResult(null);
    setError(null);
    setAmount('');
    onClose();
  };

  const toReview = () => {
    const next: Record<string, string> = {};
    const parsed = parseAmountInput(amount, 2);
    if (!parsed.ok) next.amount = parsed.error;
    if (direction === 'TRANSFER' && !beneficiaryId) next.beneficiary = 'Choose who to pay.';
    if (direction === 'WITHDRAWAL' && !bankAccountId && !phoneNumber) next.destination = 'Choose a verified account or enter a mobile number.';
    setErrors(next);
    if (Object.keys(next).length || !parsed.ok) return;
    setError(null);
    setReview({ amount: parsed.value, key: newIdempotencyKey() });
  };

  const submit = async () => {
    if (!review) return;
    setBusy(true);
    setError(null);
    try {
      const intent = await paymentsApi.createIntent(
        {
          direction,
          amount: review.amount,
          currency,
          bankAccountId: direction !== 'TRANSFER' ? bankAccountId || undefined : undefined,
          beneficiaryId: direction === 'TRANSFER' ? beneficiaryId : undefined,
          phoneNumber: phoneNumber.trim() || undefined,
          description: description.trim() || undefined,
        },
        review.key,
      );
      setResult(intent);
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const payee = payees.data?.find((p) => p.id === beneficiaryId);
  const account = verified.find((a) => a.id === bankAccountId);

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      title={result ? 'Payment started' : review ? 'Check and confirm' : 'New payment'}
      footer={
        result ? (
          <Button onClick={close}>Done</Button>
        ) : review ? (
          <>
            <Button variant="secondary" onClick={() => setReview(null)} disabled={busy}>
              Back
            </Button>
            <Button onClick={submit} loading={busy}>
              Confirm
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={toReview}>Review</Button>
          </>
        )
      }
    >
      {result ? (
        <div className="flex flex-col gap-4">
          <KeyValueList
            items={[
              { label: 'Status', value: <StatusBadge status={result.status} /> },
              { label: 'Amount', value: <MoneyText money={result.amount} /> },
              { label: 'Reference', value: <MonoRef value={result.id} /> },
            ]}
          />
          {result.customerAction && <Callout tone="warn" title="Your action needed">{result.customerAction}</Callout>}
          <p className="text-sm text-muted">We’ll notify you when it completes.</p>
        </div>
      ) : review ? (
        <div className="flex flex-col gap-4">
          <KeyValueList
            items={[
              { label: 'Type', value: DIRECTION_LABEL[direction] },
              { label: 'Amount', value: <span className="font-mono font-semibold">{review.amount} {currency}</span> },
              ...(payee ? [{ label: 'To', value: `${payee.name} · ${payee.accountRef}` }] : []),
              ...(account ? [{ label: direction === 'DEPOSIT' ? 'From' : 'To', value: `${account.bankName} ${account.accountNumberMasked}` }] : []),
              ...(phoneNumber.trim() ? [{ label: 'Mobile number', value: phoneNumber.trim() }] : []),
            ]}
          />
          {error && <Callout tone="danger">{error}</Callout>}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <Segmented
            label="Payment type"
            value={direction}
            onChange={setDirection}
            options={[
              { value: 'DEPOSIT', label: 'Deposit' },
              { value: 'WITHDRAWAL', label: 'Withdraw' },
              { value: 'TRANSFER', label: 'Pay someone' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Amount" error={errors.amount}>
              <AmountInput currency={currency} value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label="Currency">
              <Select value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {['USD', 'EUR', 'KES'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          {direction === 'TRANSFER' ? (
            <Field label="Pay" error={errors.beneficiary} hint={payees.data?.length === 0 ? 'Add a payee first, in the Payees tab.' : undefined}>
              <Select value={beneficiaryId} onChange={(e) => setBeneficiaryId(e.target.value)}>
                <option value="">Choose a payee</option>
                {payees.data?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} · {p.accountRef} ({p.currency})
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <>
              <Field label={direction === 'DEPOSIT' ? 'From bank account' : 'To bank account'} error={errors.destination} optional={direction === 'DEPOSIT'} hint="Only verified accounts can be used.">
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
            </>
          )}
          <Field label="Description" optional>
            <Input value={description} maxLength={140} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      )}
    </Modal>
  );
}
