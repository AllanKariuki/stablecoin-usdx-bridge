import { useState } from 'react';
import { Gavel, Plus } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { complianceApi, type EnforcementKind } from '@damp/web-shared/api/compliance';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, DataTable, Field, Input, Modal, MonoRef, PageHeader, Select, StatusBadge, Textarea } from '@damp/web-shared/ui';

const KINDS: Array<{ value: EnforcementKind; label: string; onChain: boolean; consequence: string }> = [
  { value: 'BLACKLIST', label: 'Blacklist an address', onChain: true, consequence: 'The USD-X contract will refuse every transfer to or from this address, on the chain you name.' },
  { value: 'UNBLACKLIST', label: 'Remove from blacklist', onChain: true, consequence: 'The address can send and receive USD-X again on that chain.' },
  { value: 'PAUSE', label: 'Pause the USD-X contract', onChain: true, consequence: 'Every USD-X transfer on that chain stops, for every holder, until it is unpaused.' },
  { value: 'UNPAUSE', label: 'Unpause the USD-X contract', onChain: true, consequence: 'USD-X transfers on that chain resume for every holder.' },
  { value: 'FREEZE_WALLET', label: 'Freeze a party’s wallets', onChain: false, consequence: 'The party’s ledger wallets refuse new postings until unfrozen.' },
  { value: 'UNFREEZE_WALLET', label: 'Unfreeze a party’s wallets', onChain: false, consequence: 'The party’s ledger wallets accept postings again.' },
];

export default function Enforcement() {
  const actions = useAsync(() => complianceApi.enforcement(), []);
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Enforcement"
        description="Blacklist, pause and freeze requests. Each one needs a second approver, and on-chain actions are carried out by the signer service."
        actions={
          <Can anyOf={['compliance:blacklist:manage']}>
            <Button icon={<Plus className="size-4" aria-hidden />} onClick={() => setOpen(true)}>
              New request
            </Button>
          </Can>
        }
      />
      <Card className="reveal">
        <DataTable
          caption="Enforcement actions"
          rows={actions.data}
          loading={actions.loading}
          error={actions.error ? apiErrorMessage(actions.error) : undefined}
          onRetry={actions.reload}
          rowKey={(a) => a.id}
          empty={{ icon: <Gavel className="size-6" aria-hidden />, title: 'No enforcement actions', body: 'Requests you or colleagues make appear here with their on-chain status.' }}
          columns={[
            { key: 'kind', header: 'Action', render: (a) => <span className="font-semibold text-ink">{humanize(a.kind)}</span> },
            { key: 'target', header: 'Target', render: (a) => <MonoRef value={a.target || a.partyId || ''} /> },
            { key: 'chain', header: 'Chain', render: (a) => a.chain || '—', hideOnMobile: true },
            { key: 'tx', header: 'Chain tx', render: (a) => (a.chainTxHash ? <MonoRef value={a.chainTxHash} /> : <span className="text-subtle">—</span>), hideOnMobile: true },
            { key: 'at', header: 'Requested', render: (a) => <span className="text-[13px] text-muted">{formatDateTime(a.createdAt)}</span>, hideOnMobile: true },
            {
              key: 'status',
              header: 'Status',
              align: 'right',
              render: (a) => (
                <span title={a.failureReason || undefined}>
                  <StatusBadge status={a.status} />
                </span>
              ),
            },
          ]}
        />
      </Card>
      {open && <NewRequestModal onClose={() => setOpen(false)} onCreated={actions.reload} />}
    </>
  );
}

function NewRequestModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [kind, setKind] = useState<EnforcementKind>('BLACKLIST');
  const [chain, setChain] = useState('ethereum');
  const [target, setTarget] = useState('');
  const [partyId, setPartyId] = useState('');
  const [caseId, setCaseId] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const meta = KINDS.find((k) => k.value === kind)!;
  const needsTarget = kind === 'BLACKLIST' || kind === 'UNBLACKLIST';

  const submit = async () => {
    if (needsTarget && !target.trim()) return setError('Enter the address this applies to.');
    if (!meta.onChain && !partyId.trim()) return setError('Enter the party whose wallets this applies to.');
    if (reason.trim().length < 5) return setError('Give a reason — it goes to the approver and the audit trail.');
    setBusy(true);
    setError(null);
    try {
      await complianceApi.proposeEnforcement({
        kind,
        chain: meta.onChain ? chain : undefined,
        target: needsTarget ? target.trim() : undefined,
        partyId: partyId.trim() || undefined,
        caseId: caseId.trim() || undefined,
        reason: reason.trim(),
      });
      onCreated();
      onClose();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={busy ? () => undefined : onClose}
      title="Request an enforcement action"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="warn" loading={busy} onClick={submit}>
            Send for approval
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Action">
          <Select value={kind} onChange={(e) => setKind(e.target.value as EnforcementKind)}>
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>
        {meta.onChain && (
          <Field label="Chain">
            <Select value={chain} onChange={(e) => setChain(e.target.value)}>
              <option value="ethereum">Ethereum</option>
              <option value="solana">Solana</option>
            </Select>
          </Field>
        )}
        {needsTarget && (
          <Field label="Address">
            <Input value={target} onChange={(e) => setTarget(e.target.value)} className="font-mono" spellCheck={false} autoComplete="off" />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Party" optional={meta.onChain}>
            <Input value={partyId} onChange={(e) => setPartyId(e.target.value)} className="font-mono" spellCheck={false} />
          </Field>
          <Field label="Case" optional>
            <Input value={caseId} onChange={(e) => setCaseId(e.target.value)} className="font-mono" spellCheck={false} />
          </Field>
        </div>
        <Field label="Reason">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} />
        </Field>
        <Callout tone="warn" title="What this does">
          {meta.consequence}{' '}
          {meta.onChain ? (
            <>
              <strong>It is not instant:</strong> the request needs a second approver, then the signer service submits the transaction and
              it takes effect once the chain confirms it. Watch its status here.
            </>
          ) : (
            <strong>It takes effect once a second approver agrees.</strong>
          )}
        </Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
