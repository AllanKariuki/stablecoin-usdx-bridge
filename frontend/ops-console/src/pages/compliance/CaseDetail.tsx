import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { FileWarning, MessageSquarePlus, UserPlus, CheckCheck } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { complianceApi } from '@damp/web-shared/api/compliance';
import { Can, useAuth } from '@damp/web-shared/auth';
import { formatDateTime, humanize, useAsync } from '@damp/web-shared/lib';
import {
  Button,
  Callout,
  Card,
  CardHeader,
  DataTable,
  ErrorState,
  Field,
  KeyValueList,
  Modal,
  MonoRef,
  PageHeader,
  Segmented,
  Skeleton,
  StatusBadge,
  Textarea,
} from '@damp/web-shared/ui';
import { BackLink, DetailGrid } from '../../components/Detail';
import { JsonBlock } from '../../components/JsonBlock';
import { SeverityBadge } from '../../components/Severity';

export default function CaseDetail() {
  const { caseId = '' } = useParams();
  const { user } = useAuth();
  const kase = useAsync(() => complianceApi.caseDetail(caseId), [caseId]);
  const [closing, setClosing] = useState(false);
  const [sarOpen, setSarOpen] = useState(false);
  const [note, setNote] = useState('');
  const [noteBusy, setNoteBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (kase.error) {
    return (
      <>
        <BackLink to="/cases">Cases</BackLink>
        <ErrorState title="This case didn't load" message={apiErrorMessage(kase.error)} onRetry={kase.reload} />
      </>
    );
  }
  const c = kase.data;
  const closed = c?.status.startsWith('CLOSED');

  const addNote = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim() || !c) return;
    setNoteBusy(true);
    setActionError(null);
    try {
      await complianceApi.addNote(c.id, note.trim());
      setNote('');
      kase.reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    } finally {
      setNoteBusy(false);
    }
  };

  const assignToMe = async () => {
    if (!c || !user) return;
    setActionError(null);
    try {
      await complianceApi.assign(c.id, user.id);
      kase.reload();
    } catch (err) {
      setActionError(apiErrorMessage(err));
    }
  };

  return (
    <>
      <BackLink to="/cases">Cases</BackLink>
      <PageHeader
        eyebrow={c ? <span className="font-mono">{c.reference}</span> : 'Case'}
        title={c ? c.title : <Skeleton className="h-8 w-64" />}
        description={c?.summary}
        actions={
          c && (
            <>
              {c.status === 'CLOSED_SAR' && (
                <Button variant="secondary" icon={<FileWarning className="size-4" aria-hidden />} onClick={() => setSarOpen(true)}>
                  View SAR
                </Button>
              )}
              {!closed && (
                <Can anyOf={['compliance:cases:manage']}>
                  {c.assignedTo !== user?.id && (
                    <Button variant="secondary" icon={<UserPlus className="size-4" aria-hidden />} onClick={assignToMe}>
                      Assign to me
                    </Button>
                  )}
                  <Button variant="navy" icon={<CheckCheck className="size-4" aria-hidden />} onClick={() => setClosing(true)}>
                    Close case…
                  </Button>
                </Can>
              )}
            </>
          )
        }
      />
      {actionError && <Callout tone="danger" className="mb-5">{actionError}</Callout>}

      <DetailGrid
        main={
          <>
            <Card>
              <CardHeader title="Alerts in this case" />
              <DataTable
                caption="Alerts in this case"
                rows={c?.alerts}
                loading={kase.loading}
                rowKey={(a) => a.id}
                empty={{ title: 'No linked alerts' }}
                columns={[
                  { key: 'sev', header: 'Severity', render: (a) => <SeverityBadge severity={a.severity} /> },
                  { key: 'rule', header: 'Rule', render: (a) => <span className="font-semibold">{humanize(a.rule)}</span> },
                  { key: 'detail', header: 'Detail', render: (a) => <span className="text-[13px] text-muted">{a.detail}</span>, hideOnMobile: true },
                  {
                    key: 'tx',
                    header: 'Transaction',
                    align: 'right',
                    render: (a) =>
                      a.transactionId ? (
                        <Link to={`/transactions/${encodeURIComponent(a.transactionId)}`} className="font-mono text-[12.5px] no-underline hover:underline">
                          {a.transactionId.slice(0, 10)}…
                        </Link>
                      ) : (
                        '—'
                      ),
                  },
                ]}
              />
            </Card>

            <Card className="reveal">
              <CardHeader title="Notes" description="Append-only: each note is evidence of what was known, and when." />
              {c && c.notes.length > 0 ? (
                <ol className="m-0 mb-4 flex list-none flex-col gap-3 p-0">
                  {c.notes.map((n, i) => (
                    <li key={i} className="rounded-[14px] border border-line bg-canvas p-3.5">
                      <div className="mb-1 flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                        <span className="font-mono text-navy">{n.author}</span>
                        <span>{formatDateTime(n.at)}</span>
                      </div>
                      <p className="m-0 text-sm whitespace-pre-wrap text-ink">{n.note}</p>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mb-4 text-sm text-subtle">No notes yet.</p>
              )}
              {!closed && (
                <Can anyOf={['compliance:cases:manage']}>
                  <form onSubmit={addNote} className="flex flex-col gap-3">
                    <Field label="Add a note">
                      <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} />
                    </Field>
                    <div>
                      <Button type="submit" variant="secondary" loading={noteBusy} icon={<MessageSquarePlus className="size-4" aria-hidden />} disabled={!note.trim()}>
                        Add note
                      </Button>
                    </div>
                  </form>
                </Can>
              )}
            </Card>
          </>
        }
        side={
          <>
            <Card className="reveal">
              <CardHeader title="Case" />
              {!c ? (
                <Skeleton className="h-28 w-full" />
              ) : (
                <KeyValueList
                  items={[
                    { label: 'Status', value: <StatusBadge status={c.status} /> },
                    { label: 'Severity', value: <SeverityBadge severity={c.severity} /> },
                    { label: 'Party', value: <MonoRef value={c.partyId} /> },
                    { label: 'Assigned to', value: c.assignedTo ? <MonoRef value={c.assignedTo} /> : 'Unassigned' },
                    { label: 'Opened', value: formatDateTime(c.createdAt) },
                    ...(c.closedAt ? [{ label: 'Closed', value: formatDateTime(c.closedAt) }] : []),
                  ]}
                />
              )}
            </Card>
            <Card className="reveal">
              <CardHeader title="Enforcement actions" />
              {c && c.enforcementActions.length > 0 ? (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {c.enforcementActions.map((a) => (
                    <li key={a.id} className="rounded-[12px] border border-line p-3 text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold">{humanize(a.kind)}</span>
                        <StatusBadge status={a.status} />
                      </div>
                      <p className="mt-1 font-mono text-[12px] break-all text-navy">{a.target}</p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-subtle">None. Request one from Enforcement.</p>
              )}
            </Card>
          </>
        }
      />

      {c && <CloseCaseModal open={closing} onClose={() => setClosing(false)} caseId={c.id} onClosed={kase.reload} />}
      {c && sarOpen && <SarModal caseId={c.id} onClose={() => setSarOpen(false)} />}
    </>
  );
}

function CloseCaseModal({ open, onClose, caseId, onClosed }: { open: boolean; onClose: () => void; caseId: string; onClosed: () => void }) {
  const [outcome, setOutcome] = useState<'CLEARED' | 'SAR'>('CLEARED');
  const [notes, setNotes] = useState('');
  const [narrative, setNarrative] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (outcome === 'SAR' && narrative.trim().length < 20) return setError('A SAR needs a narrative describing the suspicious activity.');
    setBusy(true);
    setError(null);
    try {
      await complianceApi.close(caseId, { outcome, notes: notes.trim() || undefined, sarNarrative: outcome === 'SAR' ? narrative.trim() : undefined });
      onClosed();
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
      title="Close this case"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant={outcome === 'SAR' ? 'warn' : 'navy'} loading={busy} onClick={submit}>
            {outcome === 'SAR' ? 'File SAR and close' : 'Close as cleared'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Segmented
          label="Outcome"
          value={outcome}
          onChange={setOutcome}
          options={[
            { value: 'CLEARED', label: 'Cleared — not suspicious' },
            { value: 'SAR', label: 'File a SAR' },
          ]}
        />
        <Callout tone={outcome === 'SAR' ? 'warn' : 'info'} title="What this does">
          {outcome === 'SAR'
            ? 'Files a suspicious activity report. The narrative is stored verbatim as a legal document and cannot be edited afterwards.'
            : 'Records your opinion that the activity is not suspicious. The case and its alerts stay on file.'}
        </Callout>
        {outcome === 'SAR' && (
          <Field label="SAR narrative" hint="Who, what, when, where and why it is suspicious.">
            <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={6} />
          </Field>
        )}
        <Field label="Closing notes" optional>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
        </Field>
        {error && <Callout tone="danger">{error}</Callout>}
      </div>
    </Modal>
  );
}

function SarModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const sar = useAsync(() => complianceApi.sar(caseId), [caseId]);
  return (
    <Modal open onClose={onClose} title="Suspicious activity report" size="lg">
      {sar.error ? (
        <ErrorState message={apiErrorMessage(sar.error)} onRetry={sar.reload} />
      ) : !sar.data ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <div className="flex flex-col gap-5">
          <KeyValueList
            items={[
              { label: 'Reference', value: sar.data.reference, mono: true },
              { label: 'Party', value: sar.data.partyId, mono: true },
              { label: 'Filed', value: formatDateTime(sar.data.filedAt) },
              { label: 'Filed by', value: sar.data.filedBy, mono: true },
            ]}
          />
          <div>
            <p className="eyebrow mb-1.5 text-[11px]">Narrative (as filed)</p>
            <p className="m-0 rounded-[12px] border border-line bg-canvas p-3.5 text-sm whitespace-pre-wrap text-ink">{sar.data.narrative}</p>
          </div>
          <JsonBlock label="Supporting activity" value={sar.data.supportingActivity} />
        </div>
      )}
    </Modal>
  );
}
