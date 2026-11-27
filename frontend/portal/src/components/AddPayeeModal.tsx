import { useState } from 'react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { paymentsApi, type Beneficiary } from '@damp/web-shared/api/payments';
import { Button, Callout, Field, Input, Modal, Select } from '@damp/web-shared/ui';

/**
 * "Add a payee" — shared between the Payees tab and the Send wizard's
 * recipient step, so a payee added mid-send can be paid in the same visit.
 */
export default function AddPayeeModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded?: (payee: Beneficiary) => void }) {
  const [form, setForm] = useState({ name: '', kind: 'BANK' as 'BANK' | 'WALLET' | 'MOBILE', accountRef: '', currency: 'USD' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!form.name.trim() || !form.accountRef.trim()) return setError('Enter a name and an account reference.');
    setBusy(true);
    setError(null);
    try {
      const payee = await paymentsApi.addBeneficiary({ ...form, name: form.name.trim(), accountRef: form.accountRef.trim() });
      onAdded?.(payee);
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
