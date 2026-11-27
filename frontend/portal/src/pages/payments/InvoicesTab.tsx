import { useEffect, useState } from 'react';
import { CheckCircle2, FileText, Plus } from 'lucide-react';
import { apiErrorMessage, newIdempotencyKey, parseAmountInput, type Wallet } from '@damp/web-shared/api';
import { paymentsApi, type Invoice, type PaymentIntent } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { formatDate, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, CardHeader, ConfirmDialog, DataTable, Field, Input, KeyValueList, Modal, MonoRef, MoneyText, Select, StatusBadge, Tabs } from '@damp/web-shared/ui';
import ConvertingTracker from '../../components/ConvertingTracker';
import PayFromPicker, { type PayFromSelection } from '../../components/PayFromPicker';
import { useWallets } from '../../hooks/useWallets';

export default function InvoicesTab() {
  const [role, setRole] = useState<'issued' | 'payer'>('issued');
  const invoices = useAsync(() => paymentsApi.invoices(role), [role]);
  const wallets = useWallets();
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<Invoice | null>(null);

  return (
    <Card>
      <CardHeader
        title="Invoices"
        description="Send an invoice with a payment link, or pay one you’ve been sent."
        actions={
          <Can anyOf={['payments:write:own']}>
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setCreating(true)}>
              New invoice
            </Button>
          </Can>
        }
      />
      <Tabs
        value={role}
        onChange={setRole}
        tabs={[
          { value: 'issued', label: 'Sent by me' },
          { value: 'payer', label: 'To pay' },
        ]}
      />
      <DataTable
        caption="Invoices"
        rows={invoices.data}
        loading={invoices.loading}
        error={invoices.error ? apiErrorMessage(invoices.error) : undefined}
        onRetry={invoices.reload}
        rowKey={(i) => i.id}
        empty={{
          title: role === 'issued' ? 'You haven’t sent any invoices' : 'Nothing to pay',
          body: role === 'issued' ? 'Create one and share its payment link.' : 'Invoices sent to you will appear here.',
          icon: <FileText className="size-6" aria-hidden />,
        }}
        columns={[
          { key: 'no', header: 'Invoice', render: (i) => <span className="font-mono text-[13px] font-semibold text-navy">{i.number}</span> },
          {
            key: 'who',
            header: role === 'issued' ? 'Payer' : 'Description',
            render: (i) => <span className="text-ink">{role === 'issued' ? i.payerName || i.payerEmail || '—' : i.description || '—'}</span>,
          },
          { key: 'due', header: 'Due', hideOnMobile: true, render: (i) => <span className="text-muted">{formatDate(i.dueDate)}</span> },
          { key: 'status', header: 'Status', render: (i) => <StatusBadge status={i.status} /> },
          { key: 'amount', header: 'Amount', align: 'right', render: (i) => <MoneyText money={i.amount} /> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (i) =>
              i.status.toUpperCase() !== 'OPEN' ? null : (
                <Can anyOf={['payments:write:own']}>
                  {role === 'issued' ? (
                    <div className="flex justify-end gap-1">
                      {i.payLink && (
                        <Button size="sm" variant="ghost" onClick={() => void navigator.clipboard?.writeText(i.payLink!)}>
                          Copy link
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setVoiding(i)}>
                        Void
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" onClick={() => setPaying(i)}>
                      Pay
                    </Button>
                  )}
                </Can>
              ),
          },
        ]}
      />

      <NewInvoiceModal open={creating} onClose={() => setCreating(false)} onCreated={invoices.reload} />

      <ConfirmDialog
        open={voiding !== null}
        onClose={() => setVoiding(null)}
        title={`Void invoice ${voiding?.number ?? ''}?`}
        confirmLabel="Void invoice"
        variant="warn"
        consequence="The payment link stops working and the invoice can no longer be paid. This can’t be undone."
        onConfirm={async () => {
          try {
            await paymentsApi.voidInvoice(voiding!.id);
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
          invoices.reload();
        }}
      />

      <PayInvoiceModal invoice={paying} wallets={wallets.data ?? []} open={paying !== null} onClose={() => setPaying(null)} onPaid={invoices.reload} />
    </Card>
  );
}

/** Pay an open invoice from any wallet — same currency pays straight out,
 * cross-currency rides a TO-side quote, a USD-X source books as CONVERTING. */
function PayInvoiceModal({ invoice, wallets, open, onClose, onPaid }: { invoice: Invoice | null; wallets: Wallet[]; open: boolean; onClose: () => void; onPaid: () => void }) {
  const [source, setSource] = useState<PayFromSelection>({});
  const [idempotencyKey, setIdempotencyKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PaymentIntent | null>(null);

  useEffect(() => {
    if (open) {
      setSource({});
      setIdempotencyKey(null);
      setBusy(false);
      setError(null);
      setResult(null);
    }
  }, [open]);

  const targetCurrency = invoice?.amount.currency ?? 'USD';
  const targetAmount = invoice?.amount.amount ?? null;

  const sourceWallet = source.sourceWallet;
  const needsQuote = Boolean(sourceWallet && sourceWallet.currency !== targetCurrency && !(sourceWallet.currency === 'USDX' && targetCurrency === 'USD'));
  const quoteReady = !needsQuote || Boolean(source.quoteId);

  const submit = async () => {
    if (!invoice) return;
    // One idempotency key per confirmed pay, reused on every retry of it.
    const key = idempotencyKey ?? newIdempotencyKey();
    setIdempotencyKey(key);
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const intent = await paymentsApi.payInvoice(invoice.id, key, {
        ...(source.sourceWalletId ? { sourceWalletId: source.sourceWalletId } : {}),
        ...(source.quoteId ? { quoteId: source.quoteId, sourceAmount: source.sourceAmount } : {}),
      });
      setResult(intent);
      onPaid();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title={result ? (result.status.toUpperCase() === 'CONVERTING' ? 'Invoice paying' : 'Payment sent') : `Pay invoice ${invoice?.number ?? ''}`}
      footer={
        result ? (
          <Button onClick={onClose}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy} disabled={!quoteReady}>
              Pay {invoice?.amount.display ?? ''}
            </Button>
          </>
        )
      }
    >
      {result ? (
        result.status.toUpperCase() === 'CONVERTING' ? (
          <ConvertingTracker intent={result} />
        ) : (
          <div className="flex flex-col items-start gap-4" role="status">
            <span className="grid size-14 place-items-center rounded-[18px] bg-cyan-tint text-cyan-ink">
              <CheckCircle2 className="size-7" aria-hidden />
            </span>
            <h2 className="text-2xl font-extrabold tracking-tight text-navy">Payment sent</h2>
            <KeyValueList
              className="w-full"
              items={[
                { label: 'Status', value: <StatusBadge status={result.status} /> },
                { label: 'Amount', value: <MoneyText money={result.amount} /> },
                { label: 'Reference', value: <MonoRef value={result.id} /> },
              ]}
            />
          </div>
        )
      ) : (
        <div className="flex flex-col gap-4">
          <PayFromPicker wallets={wallets} targetCurrency={targetCurrency} targetAmount={targetAmount} onChange={setSource} />
          {error && <Callout tone="danger">{error}</Callout>}
        </div>
      )}
    </Modal>
  );
}

function NewInvoiceModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ amount: '', currency: 'USD', payerName: '', payerEmail: '', dueDate: '', description: '' });
  const [amountError, setAmountError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Invoice | null>(null);
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    setCreated(null);
    setError(null);
    setForm({ amount: '', currency: 'USD', payerName: '', payerEmail: '', dueDate: '', description: '' });
    onClose();
  };

  const submit = async () => {
    const parsed = parseAmountInput(form.amount, 2);
    if (!parsed.ok) return setAmountError(parsed.error);
    setAmountError(undefined);
    setBusy(true);
    setError(null);
    try {
      setCreated(
        await paymentsApi.createInvoice({
          amount: parsed.value,
          currency: form.currency,
          payerName: form.payerName.trim() || undefined,
          payerEmail: form.payerEmail.trim() || undefined,
          dueDate: form.dueDate || undefined,
          description: form.description.trim() || undefined,
        }),
      );
      onCreated();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : close}
      title={created ? `Invoice ${created.number} created` : 'New invoice'}
      footer={
        created ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={submit} loading={busy}>
              Create invoice
            </Button>
          </>
        )
      }
    >
      {created ? (
        <div className="flex flex-col gap-4">
          <KeyValueList items={[{ label: 'Amount', value: <MoneyText money={created.amount} /> }, { label: 'Status', value: <StatusBadge status={created.status} /> }]} />
          {created.payLink && (
            <Callout tone="success" title="Share this payment link">
              <MonoRef value={created.payLink} truncate={false} />
            </Callout>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <Field label="Amount" error={amountError}>
              <AmountInput currency={form.currency} value={form.amount} onChange={set('amount')} />
            </Field>
            <Field label="Currency">
              <Select value={form.currency} onChange={set('currency')}>
                {['USD', 'EUR', 'KES'].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Payer name" optional>
            <Input value={form.payerName} onChange={set('payerName')} />
          </Field>
          <Field label="Payer email" optional hint="We email them the payment link.">
            <Input type="email" value={form.payerEmail} onChange={set('payerEmail')} />
          </Field>
          <Field label="Due date" optional>
            <Input type="date" value={form.dueDate} onChange={set('dueDate')} />
          </Field>
          <Field label="What it’s for" optional>
            <Input value={form.description} maxLength={200} onChange={set('description')} />
          </Field>
          {error && <Callout tone="danger">{error}</Callout>}
        </div>
      )}
    </Modal>
  );
}
