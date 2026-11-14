import { useState } from 'react';
import { Plus, Users } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { paymentsApi } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { humanize, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, Callout, Card, CardHeader, DataTable, Field, Input, Modal, Select } from '@damp/web-shared/ui';

export default function PayeesTab() {
  const payees = useAsync(() => paymentsApi.beneficiaries(), []);
  const [adding, setAdding] = useState(false);
  return (
    <Card>
      <CardHeader
        title="Payees"
        description="People and businesses you pay. Pick one from “Pay someone” in Activity."
        actions={
          <Can anyOf={['payments:write:own']}>
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
              Add payee
            </Button>
          </Can>
        }
      />
      <DataTable
        caption="Payees"
        rows={payees.data}
        loading={payees.loading}
        error={payees.error ? apiErrorMessage(payees.error) : undefined}
        onRetry={payees.reload}
        rowKey={(p) => p.id}
        empty={{ title: 'No payees yet', body: 'Save someone once, then pay them in a couple of taps.', icon: <Users className="size-6" aria-hidden /> }}
        columns={[
          { key: 'name', header: 'Name', render: (p) => <span className="font-semibold text-ink">{p.name}</span> },
          { key: 'kind', header: 'Type', render: (p) => <Badge tone="neutral">{humanize(p.kind)}</Badge> },
          { key: 'ref', header: 'Account', render: (p) => <span className="font-mono text-[13px] text-navy">{p.accountRef}</span> },
          { key: 'ccy', header: 'Currency', align: 'right', render: (p) => p.currency },
        ]}
      />
      <AddPayeeModal open={adding} onClose={() => setAdding(false)} onAdded={payees.reload} />
    </Card>
  );
}

function AddPayeeModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const [form, setForm] = useState({ name: '', kind: 'BANK' as 'BANK' | 'WALLET' | 'MOBILE', accountRef: '', currency: 'USD' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!form.name.trim() || !form.accountRef.trim()) return setError('Enter a name and an account reference.');
    setBusy(true);
    setError(null);
    try {
      await paymentsApi.addBeneficiary({ ...form, name: form.name.trim(), accountRef: form.accountRef.trim() });
      onAdded();
      setForm({ name: '', kind: 'BANK', accountRef: '', currency: 'USD' });
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  const refLabel = form.kind === 'MOBILE' ? 'Phone number' : form.kind === 'WALLET' ? 'DAMP account email or reference' : 'Account number';
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onClose}
      title="Add a payee"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Save payee
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Name">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </Field>
        <Field label="Type">
          <Select value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as typeof f.kind }))}>
            <option value="BANK">Bank account</option>
            <option value="MOBILE">Mobile money</option>
            <option value="WALLET">Another DAMP customer</option>
          </Select>
        </Field>
        <Field label={refLabel}>
          <Input value={form.accountRef} onChange={(e) => setForm((f) => ({ ...f, accountRef: e.target.value }))} />
        </Field>
        <Field label="Currency">
          <Select value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value }))}>
            {['USD', 'EUR', 'KES'].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </Select>
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
