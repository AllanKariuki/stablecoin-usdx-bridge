import { useMemo, useState } from 'react';
import { Building2, Landmark, Plus, Smartphone } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { paymentsApi, type Bank, type BankAccount } from '@damp/web-shared/api/payments';
import { Can } from '@damp/web-shared/auth';
import { formatDate, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, Callout, Card, CardHeader, ConfirmDialog, DataTable, EmptyState, Field, Input, Modal, Select, SkeletonRows, StatusBadge, Tabs } from '@damp/web-shared/ui';
import { isKenyanMobile } from '../../lib/phone';

type Section = 'bank' | 'mobile' | 'institutions';

const isMobileRail = (b: Bank | undefined) => Boolean(b?.rail.toLowerCase().includes('mpesa'));

/**
 * Banks & mobile money: the accounts money comes in from and goes out to.
 * Registering an account and being able to withdraw to it are different
 * events (services/payments' "linked" = verified subset), so status is
 * front and centre and verification is its own action. Bank accounts and
 * M-Pesa numbers are both bank_accounts rows — the institution's rail is
 * what tells them apart — but customers think of them separately, so they
 * get separate tabs.
 */
export default function BankAccountsTab() {
  const accounts = useAsync(() => paymentsApi.bankAccounts(), []);
  const banks = useAsync(() => paymentsApi.availableBanks(), []);
  const [section, setSection] = useState<Section>('bank');
  const [adding, setAdding] = useState<'bank' | 'mobile' | null>(null);
  const [removing, setRemoving] = useState<BankAccount | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [rowError, setRowError] = useState<string | null>(null);

  const byId = useMemo(() => new Map((banks.data ?? []).map((b) => [b.id, b])), [banks.data]);
  const all = accounts.data;
  const mobile = all?.filter((a) => isMobileRail(byId.get(a.bankId)));
  const bank = all?.filter((a) => !isMobileRail(byId.get(a.bankId)));

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

  const table = (rows: BankAccount[] | undefined, kind: 'bank' | 'mobile') => (
    <DataTable
      caption={kind === 'bank' ? 'Bank accounts' : 'Mobile money numbers'}
      rows={rows}
      loading={accounts.loading || banks.loading}
      error={accounts.error ? apiErrorMessage(accounts.error) : undefined}
      onRetry={accounts.reload}
      rowKey={(a) => a.id}
      empty={
        kind === 'bank'
          ? { title: 'No bank accounts linked', body: 'Link a bank account to deposit from it and withdraw to it.', icon: <Landmark className="size-6" aria-hidden /> }
          : { title: 'No M-Pesa numbers yet', body: 'Add your M-Pesa number to deposit and withdraw shillings from your phone.', icon: <Smartphone className="size-6" aria-hidden /> }
      }
      columns={[
        {
          key: 'account',
          header: kind === 'bank' ? 'Account' : 'Number',
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
  );

  return (
    <Card>
      <CardHeader
        title="Banks & mobile money"
        description="Deposits come from these accounts; withdrawals can only go to verified ones."
        actions={
          section !== 'institutions' ? (
            <Can anyOf={['payments:write:own']}>
              <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setAdding(section)}>
                {section === 'bank' ? 'Add bank account' : 'Add M-Pesa number'}
              </Button>
            </Can>
          ) : undefined
        }
      />
      <Tabs<Section>
        value={section}
        onChange={setSection}
        tabs={[
          { value: 'bank', label: 'My bank accounts', count: bank?.length },
          { value: 'mobile', label: 'Mobile money', count: mobile?.length },
          { value: 'institutions', label: 'Available institutions' },
        ]}
      />
      {rowError && <Callout tone="danger" className="mb-4">{rowError}</Callout>}
      {section === 'bank' && table(bank, 'bank')}
      {section === 'mobile' && table(mobile, 'mobile')}
      {section === 'institutions' && <Institutions banks={banks.data} loading={banks.loading} error={banks.error} onRetry={banks.reload} />}

      <AddAccountModal
        kind={adding}
        banks={(banks.data ?? []).filter((b) => (adding === 'mobile' ? isMobileRail(b) : !isMobileRail(b)))}
        onClose={() => setAdding(null)}
        onAdded={accounts.reload}
      />
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

/** The institutions this platform can move money through, and how. */
function Institutions({ banks, loading, error, onRetry }: { banks: Bank[] | undefined; loading: boolean; error: unknown; onRetry: () => void }) {
  if (loading) return <SkeletonRows rows={3} />;
  if (error) return <Callout tone="danger" action={<Button size="sm" variant="secondary" onClick={onRetry}>Retry</Button>}>{apiErrorMessage(error)}</Callout>;
  if (!banks?.length) return <EmptyState icon={<Building2 className="size-6" aria-hidden />} title="No institutions available" />;
  return (
    <ul className="grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-3">
      {banks.map((b) => (
        <li key={b.id} className="flex items-start gap-3 rounded-2xl border border-line bg-surface p-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-action-tint text-action">
            {isMobileRail(b) ? <Smartphone className="size-5" aria-hidden /> : <Landmark className="size-5" aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="font-semibold text-navy">{b.name}</p>
            <p className="text-xs text-muted">
              {b.country} · {b.currency}
            </p>
            <Badge tone={isMobileRail(b) ? 'cyan' : 'neutral'} className="mt-1.5">
              {isMobileRail(b) ? 'Mobile money' : 'Bank transfer'}
            </Badge>
          </div>
        </li>
      ))}
    </ul>
  );
}

function AddAccountModal({ kind, banks, onClose, onAdded }: { kind: 'bank' | 'mobile' | null; banks: Bank[]; onClose: () => void; onAdded: () => void }) {
  const [bankId, setBankId] = useState('');
  const [accountName, setAccountName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mobile = kind === 'mobile';
  // M-Pesa is a single institution: no choice to make.
  const effectiveBankId = mobile ? (banks[0]?.id ?? '') : bankId;
  const bank = banks.find((b) => b.id === effectiveBankId);

  const reset = () => {
    setBankId('');
    setAccountName('');
    setAccountNumber('');
    setError(null);
  };

  const submit = async () => {
    if (!effectiveBankId || !accountNumber.trim()) return setError(mobile ? 'Enter your M-Pesa number.' : 'Choose a bank and enter the account number.');
    if (mobile && !isKenyanMobile(accountNumber)) return setError('Enter a Safaricom number like 2547XXXXXXXX.');
    setBusy(true);
    setError(null);
    try {
      await paymentsApi.registerBankAccount({ bankId: effectiveBankId, accountName: accountName.trim(), accountNumber: accountNumber.trim(), currency: bank?.currency });
      onAdded();
      reset();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={kind !== null}
      onClose={busy ? () => undefined : () => (reset(), onClose())}
      title={mobile ? 'Add an M-Pesa number' : 'Add a bank account'}
      footer={
        <>
          <Button variant="secondary" onClick={() => (reset(), onClose())} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} loading={busy}>
            {mobile ? 'Add number' : 'Add account'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!mobile && (
          <Field label="Bank">
            <Select value={bankId} onChange={(e) => setBankId(e.target.value)}>
              <option value="">Choose one</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} · {b.country} ({b.currency})
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="Account holder name">
          <Input autoComplete="name" value={accountName} onChange={(e) => setAccountName(e.target.value)} />
        </Field>
        <Field label={mobile ? 'M-Pesa number' : 'Account number'} hint={mobile ? 'International format, e.g. 2547XXXXXXXX.' : 'We store only the last four digits in plain view.'}>
          <Input inputMode={mobile ? 'tel' : 'numeric'} autoComplete="off" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
        </Field>
        <Callout tone="info">New accounts start unverified. Verify one before withdrawing to it.</Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
