import { useState } from 'react';
import { Landmark, Plus } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { paymentsApi, type BankAccount } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { formatDate, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, CardHeader, ConfirmDialog, DataTable, Field, Input, Modal, Select, StatusBadge } from '@damp/web-shared/ui';

/**
 * Registering an account and being able to withdraw to it are different
 * events (services/payments' "linked" = verified subset), so status is
 * front and centre and verification is its own action.
 */
export default function BankAccountsTab() {
  const accounts = useAsync(() => paymentsApi.bankAccounts(), []);
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<BankAccount | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const verify = async (a: BankAccount) => {
    setVerifying(a.id);
    setRowError(null);
    try {
      await paymentsApi.verifyBankAccount(a.id);
      accounts.reload();
    } catch (err) {
      setRowError(apiErrorMessage(err));
    } finally {
      setVerifying(null);
    }
  };

  return (
    <Card>
      <CardHeader
        title="Bank and mobile money accounts"
        description="Withdrawals can only go to verified accounts."
        actions={
          <Can anyOf={['payments:write:own']}>
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(true)}>
              Add account
            </Button>
          </Can>
        }
      />
      {rowError && <Callout tone="danger" className="mb-4">{rowError}</Callout>}
      <DataTable
        caption="Bank accounts"
        rows={accounts.data}
        loading={accounts.loading}
        error={accounts.error ? apiErrorMessage(accounts.error) : undefined}
        onRetry={accounts.reload}
        rowKey={(a) => a.id}
        empty={{ title: 'No accounts linked', body: 'Add a bank or mobile money account to deposit from it and withdraw to it.', icon: <Landmark className="size-6" aria-hidden /> }}
        columns={[
          {
            key: 'bank',
            header: 'Account',
            render: (a) => (
              <div>
                <p className="font-semibold text-ink">
                  {a.bankName} <span className="font-mono text-[13px] text-muted">{a.accountNumberMasked}</span>
                </p>
                <p className="text-xs text-muted">{a.accountName}</p>
              </div>
            ),
          },
          { key: 'ccy', header: 'Currency', hideOnMobile: true, render: (a) => a.currency },
          { key: 'status', header: 'Status', render: (a) => <StatusBadge status={a.status} /> },
          { key: 'verified', header: 'Verified', hideOnMobile: true, render: (a) => <span className="text-muted">{formatDate(a.verifiedAt)}</span> },
          {
            key: 'actions',
            header: <span className="sr-only">Actions</span>,
            align: 'right',
            render: (a) => (
              <Can anyOf={['payments:write:own']}>
                <div className="flex justify-end gap-1">
                  {a.status.toUpperCase() !== 'VERIFIED' && (
                    <Button size="sm" variant="secondary" loading={verifying === a.id} onClick={() => verify(a)}>
                      Verify
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setRemoving(a)}>
                    Remove
                  </Button>
                </div>
              </Can>
            ),
          },
        ]}
      />
      <AddAccountModal open={adding} onClose={() => setAdding(false)} onAdded={accounts.reload} />
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this account?"
        confirmLabel="Remove"
        variant="warn"
        consequence={removing ? `${removing.bankName} ${removing.accountNumberMasked} can no longer be used for deposits or withdrawals. Payments already in progress aren’t affected.` : undefined}
        onConfirm={async () => {
          try {
            await paymentsApi.removeBankAccount(removing!.id);
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
          accounts.reload();
        }}
      />
    </Card>
  );
}

function AddAccountModal({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const banks = useAsync(() => (open ? paymentsApi.availableBanks() : Promise.resolve([])), [open]);
  const [bankId, setBankId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bank = banks.data?.find((b) => b.id === bankId);

  const submit = async () => {
    if (!bankId || !accountNumber.trim()) return setError('Choose a bank and enter the account number.');
    setBusy(true);
    setError(null);
    try {
      await paymentsApi.registerBankAccount({ bankId, accountName: accountName.trim(), accountNumber: accountNumber.trim(), currency: bank?.currency });
      onAdded();
      setBankId('');
      setAccountName('');
      setAccountNumber('');
      onClose();
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
      title="Add an account"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            Add account
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Bank or provider" error={banks.error ? apiErrorMessage(banks.error) : undefined}>
          <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
            <option value="">{banks.loading ? 'Loading…' : 'Choose one'}</option>
            {banks.data?.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} · {b.country} ({b.currency})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Account holder name">
          <Input autoComplete="name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </Field>
        <Field label={bank?.rail?.toLowerCase().includes('mpesa') ? 'Phone number' : 'Account number'} hint="We store only the last four digits in plain view.">
          <Input inputMode="numeric" autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <Callout tone="info">New accounts start unverified. Verify one before withdrawing to it.</Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
