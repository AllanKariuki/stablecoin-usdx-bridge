import { useState } from 'react';
import { Building2, Pencil, RefreshCw, Target } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { reservesApi, type Custodian, type ReserveTarget } from '@damp/web-shared/api/reserves';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Button, Callout, Card, CardHeader, DataTable, Drawer, Field, Input, Modal, MoneyText, PageHeader, StatusBadge } from '@damp/web-shared/ui';
import { PAGE_SIZES } from '../../list';

export default function Custodians() {
  const custodians = useAsync(() => reservesApi.custodians(), []);
  const targets = useAsync(() => reservesApi.targets(), []);
  const [selected, setSelected] = useState<Custodian | null>(null);
  const [editing, setEditing] = useState<ReserveTarget | 'new' | null>(null);

  return (
    <>
      <PageHeader eyebrow="Treasury" title="Custodians & targets" description="Where the fiat backing sits, and the coverage the platform is mandated to hold." />
      <div className="flex flex-col gap-5">
        <Card className="reveal">
          <CardHeader title="Custodians" description="Select one for its statements." />
          <DataTable
            caption="Custodians"
            pageSize={10}
            rows={custodians.data}
            loading={custodians.loading}
            error={custodians.error ? apiErrorMessage(custodians.error) : undefined}
            onRetry={custodians.reload}
            rowKey={(c) => c.id}
            onRowClick={setSelected}
            empty={{ icon: <Building2 className="size-6" aria-hidden />, title: 'No custodians configured' }}
            columns={[
              { key: 'name', header: 'Custodian', render: (c) => <span className="font-semibold text-ink">{c.name}</span> },
              { key: 'ccy', header: 'Currency', render: (c) => c.currency },
              { key: 'provider', header: 'Provider', render: (c) => c.provider, hideOnMobile: true },
              { key: 'ref', header: 'Account', render: (c) => <span className="font-mono text-[12.5px]">{c.accountRef}</span>, hideOnMobile: true },
              { key: 'status', header: 'Status', align: 'right', render: (c) => <StatusBadge status={c.status} /> },
            ]}
          />
        </Card>

        <Card className="reveal">
          <CardHeader
            title="Reserve targets"
            description="Minimum coverage ratio and buffer per currency. rms flags coverage below these as outside mandate."
            actions={
              <Can anyOf={['reserves:manage']}>
                <Button size="sm" variant="secondary" icon={<Target className="size-3.5" aria-hidden />} onClick={() => setEditing('new')}>
                  Add target
                </Button>
              </Can>
            }
          />
          <DataTable
            caption="Reserve targets"
            pageSize={10}
            rows={targets.data}
            loading={targets.loading}
            error={targets.error ? apiErrorMessage(targets.error) : undefined}
            onRetry={targets.reload}
            rowKey={(t) => t.currency}
            empty={{ icon: <Target className="size-6" aria-hidden />, title: 'No targets set', body: 'Without a target, coverage is shown but never judged.' }}
            columns={[
              { key: 'ccy', header: 'Currency', render: (t) => <span className="font-bold text-navy">{t.currency}</span> },
              { key: 'min', header: 'Minimum ratio', render: (t) => `${(t.minRatioBps / 100).toFixed(2)}%` },
              { key: 'buffer', header: 'Buffer', render: (t) => <span className="font-mono">{t.bufferAmount}</span> },
              { key: 'note', header: 'Note', render: (t) => <span className="text-[13px] text-muted">{t.note || '—'}</span>, hideOnMobile: true },
              {
                key: 'edit',
                header: <span className="sr-only">Edit</span>,
                align: 'right',
                render: (t) => (
                  <Can anyOf={['reserves:manage']}>
                    <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" aria-hidden />} onClick={() => setEditing(t)} aria-label={`Edit ${t.currency} target`}>
                      Edit
                    </Button>
                  </Can>
                ),
              },
            ]}
          />
        </Card>
      </div>

      {selected && <StatementsDrawer custodian={selected} onClose={() => setSelected(null)} />}
      {editing && <TargetModal target={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={targets.reload} />}
    </>
  );
}

function StatementsDrawer({ custodian, onClose }: { custodian: Custodian; onClose: () => void }) {
  const statements = useAsync(() => reservesApi.statements(custodian.id), [custodian.id]);
  const [polling, setPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const poll = async () => {
    setPolling(true);
    setError(null);
    try {
      await reservesApi.poll(custodian.id);
      statements.reload();
    } catch (err) {
      setError(apiErrorMessage(err));
    } finally {
      setPolling(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={custodian.name}
      footer={
        <Can anyOf={['reserves:manage']}>
          <Button variant="secondary" loading={polling} icon={<RefreshCw className="size-4" aria-hidden />} onClick={poll}>
            Fetch statement now
          </Button>
        </Can>
      }
    >
      <div className="flex flex-col gap-4">
        {custodian.drift !== '0' && (
          <Callout tone="warn" title="A test drift is configured">
            Statements from this custodian are offset by <span className="font-mono">{custodian.drift}</span>. This exists to exercise
            reconciliation outside production.
          </Callout>
        )}
        {error && <Callout tone="danger">{error}</Callout>}
        <DataTable
          caption="Custodian statements"
          pageSize={10}
          pageSizeOptions={PAGE_SIZES}
          rows={statements.data}
          loading={statements.loading}
          error={statements.error ? apiErrorMessage(statements.error) : undefined}
          onRetry={statements.reload}
          rowKey={(s) => s.id}
          empty={{ title: 'No statements yet' }}
          columns={[
            { key: 'asof', header: 'As of', render: (s) => <span title={formatDateTime(s.asOf)}>{timeAgo(s.asOf)}</span> },
            { key: 'bal', header: 'Balance', align: 'right', render: (s) => <MoneyText money={s.balance} /> },
            {
              key: 'posted',
              header: 'Posted to ledger',
              align: 'right',
              render: (s) => (s.postedAt ? <StatusBadge status="POSTED" /> : <span title={s.lastError || undefined}><StatusBadge status="PENDING" label={`Pending (${s.postAttempts})`} /></span>),
            },
          ]}
        />
      </div>
    </Drawer>
  );
}

function TargetModal({ target, onClose, onSaved }: { target: ReserveTarget | null; onClose: () => void; onSaved: () => void }) {
  const [currency, setCurrency] = useState(target?.currency ?? '');
  const [pct, setPct] = useState(target ? (target.minRatioBps / 100).toString() : '100');
  const [buffer, setBuffer] = useState(target?.bufferAmount ?? '0');
  const [note, setNote] = useState(target?.note ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    if (!/^[A-Z]{3,5}$/.test(currency.trim())) return setError('Currency is a 3–5 letter code, e.g. USD.');
    if (!/^\d+(\.\d{1,2})?$/.test(pct.trim())) return setError('Minimum ratio is a percentage with up to two decimals.');
    if (!/^\d+(\.\d+)?$/.test(buffer.trim())) return setError('Buffer is a non-negative decimal amount.');
    const [whole, frac = ''] = pct.trim().split('.');
    const minRatioBps = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
    setBusy(true);
    setError(null);
    try {
      await reservesApi.setTarget(currency.trim(), { minRatioBps, bufferAmount: buffer.trim(), note: note.trim() });
      onSaved();
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
      title={target ? `Edit ${target.currency} target` : 'Add a reserve target'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button loading={busy} onClick={save}>
            Save target
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Currency">
          <Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} disabled={Boolean(target)} maxLength={5} />
        </Field>
        <Field label="Minimum coverage ratio (%)" hint="100% means every USD-X must be backed one-for-one.">
          <Input value={pct} onChange={(e) => setPct(e.target.value)} inputMode="decimal" />
        </Field>
        <Field label="Buffer amount" hint="Extra backing to hold above the ratio, in the currency's units.">
          <Input value={buffer} onChange={(e) => setBuffer(e.target.value)} inputMode="decimal" className="font-mono" />
        </Field>
        <Field label="Note" optional>
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <Callout tone="warn" title="What this does">
          Changes what “within mandate” means for coverage from now on. The previous value is kept in the audit trail.
        </Callout>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}
