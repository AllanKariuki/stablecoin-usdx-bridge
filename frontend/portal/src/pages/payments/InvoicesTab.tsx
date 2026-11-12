import { useState } from 'react';
import { FileText, Plus } from 'lucide-react';
import { apiErrorMessage, newIdempotencyKey, parseAmountInput } from '@damp/web-shared/api';
import { paymentsApi, type Invoice } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { formatDate, useAsync } from '@damp/web-shared/lib';
import { AmountInput, Button, Callout, Card, CardHeader, ConfirmDialog, DataTable, Field, Input, KeyValueList, Modal, MonoRef, MoneyText, Select, StatusBadge, Tabs } from '@damp/web-shared/ui';

export default function InvoicesTab() {
  const [role, setRole] = useState<'issued' | 'payer'>('issued');
  const invoices = useAsync(() => paymentsApi.invoices(role), [role]);
  const [creating, setCreating] = useState(false);
  const [voiding, setVoiding] = useState<Invoice | null>(null);
  const [paying, setPaying] = useState<{ invoice: Invoice; key: string } | null>(null);

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
                    <Button size="sm" onClick={() => setPaying({ invoice: i, key: newIdempotencyKey() })}>
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

      <ConfirmDialog
        open={paying !== null}
        onClose={() => setPaying(null)}
        title={`Pay invoice ${paying?.invoice.number ?? ''}`}
        confirmLabel={paying ? `Pay ${paying.invoice.amount.display}` : 'Pay'}
        consequence="Money moves from your wallet to the issuer’s straight away, in one ledger transaction."
        onConfirm={async () => {
          try {
            await paymentsApi.payInvoice(paying!.invoice.id, paying!.key);
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
          invoices.reload();
        }}
      >
        {paying && (
          <KeyValueList
            items={[
              { label: 'Amount', value: <MoneyText money={paying.invoice.amount} /> },
              { label: 'Description', value: paying.invoice.description || '—' },
              { label: 'Due', value: formatDate(paying.invoice.dueDate) },
            ]}
          />
        )}
      </ConfirmDialog>
    </Card>
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
