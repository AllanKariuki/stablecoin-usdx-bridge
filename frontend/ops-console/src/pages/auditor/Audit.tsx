import { useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Anchor, Link2, Link2Off, Search, ShieldCheck } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { auditApi, type AuditEvent, type AuditEventFilter } from '@damp/web-shared/api/audit';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import {
  Badge,
  Button,
  Callout,
  Card,
  CardHeader,
  DataTable,
  Drawer,
  ErrorState,
  Field,
  Input,
  KeyValueList,
  MonoRef,
  PageHeader,
  Skeleton,
  StatusBadge,
  Tabs,
} from '@damp/web-shared/ui';
import { JsonBlock } from '../../components/JsonBlock';

/** Read-only by construction: every call here is a GET. */
export default function Audit() {
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'anchors' ? 'anchors' : 'events';
  return (
    <>
      <PageHeader
        eyebrow="Evidence"
        title="Audit trail"
        description="Every actor event, hash-chained in order and anchored in Merkle batches. Verify the chain, or prove any one event against its anchor."
      />
      <ChainBanner />
      <Tabs
        value={tab}
        onChange={(t) => setParams(t === 'events' ? {} : { tab: t }, { replace: true })}
        tabs={[
          { value: 'events', label: 'Events' },
          { value: 'anchors', label: 'Anchors' },
        ]}
      />
      {tab === 'events' ? <EventsTab /> : <AnchorsTab />}
    </>
  );
}

export function ChainBanner() {
  const verify = useAsync(() => auditApi.verify(), []);
  if (verify.loading) return <Skeleton className="mb-5 h-16 w-full rounded-2xl" />;
  if (verify.error) return <Callout tone="warn" title="Chain verification is unavailable" className="mb-5">{apiErrorMessage(verify.error)}</Callout>;
  const v = verify.data!;
  return v.intact ? (
    <Callout tone="navy" title="Hash chain intact" className="mb-5" action={<Button size="sm" variant="secondary" onClick={verify.reload}>Verify again</Button>}>
      {v.events.toLocaleString()} events re-hashed in order; every event's prev_hash matches the one before it.
    </Callout>
  ) : (
    <Callout tone="danger" title="Hash chain broken" className="mb-5" action={<Button size="sm" variant="secondary" onClick={verify.reload}>Verify again</Button>}>
      The chain stops matching at event <span className="font-mono">{String(v.first_broken)}</span>. Events after it cannot be trusted until this is
      investigated.
    </Callout>
  );
}

function EventsTab() {
  const [draft, setDraft] = useState<AuditEventFilter>({});
  const [filter, setFilter] = useState<AuditEventFilter>({});
  const events = useAsync(() => auditApi.events({ ...filter, limit: 200 }), [JSON.stringify(filter)]);
  const [selected, setSelected] = useState<AuditEvent | null>(null);

  const apply = (e: FormEvent) => {
    e.preventDefault();
    setFilter(Object.fromEntries(Object.entries(draft).filter(([, v]) => v)) as AuditEventFilter);
  };
  const field = (key: keyof AuditEventFilter, label: string) => (
    <Field label={label}>
      <Input value={(draft[key] as string) ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))} className="min-h-10 font-mono text-[13px]" spellCheck={false} />
    </Field>
  );

  return (
    <>
      <Card className="mb-5">
        <form onSubmit={apply} className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          {field('actor', 'Actor')}
          {field('action', 'Action')}
          {field('subject_type', 'Subject type')}
          {field('subject_id', 'Subject id')}
          <Button type="submit" variant="secondary" icon={<Search className="size-4" aria-hidden />}>
            Filter
          </Button>
        </form>
      </Card>
      <Card>
        <DataTable
          caption="Audit events"
          rows={events.data}
          loading={events.loading}
          error={events.error ? apiErrorMessage(events.error) : undefined}
          onRetry={events.reload}
          rowKey={(e) => e.id}
          onRowClick={setSelected}
          empty={{ icon: <Link2 className="size-6" aria-hidden />, title: 'No events match', body: 'Try a broader filter.' }}
          columns={[
            { key: 'seq', header: 'Seq', render: (e) => <span className="font-mono text-[12.5px] text-subtle">{e.seq}</span> },
            { key: 'at', header: 'When', render: (e) => <span title={formatDateTime(e.occurred_at)}>{timeAgo(e.occurred_at)}</span> },
            { key: 'action', header: 'Action', render: (e) => <span className="font-semibold text-ink">{humanize(e.action)}</span> },
            { key: 'actor', header: 'Actor', render: (e) => <span className="font-mono text-[12.5px]">{e.actor.slice(0, 14)}</span>, hideOnMobile: true },
            { key: 'subject', header: 'Subject', render: (e) => <span className="font-mono text-[12.5px] text-navy">{e.subject_type}:{(e.subject_id || '').slice(0, 10)}</span>, hideOnMobile: true },
            { key: 'service', header: 'Service', render: (e) => e.service, hideOnMobile: true },
            {
              key: 'anchor',
              header: 'Anchored',
              align: 'right',
              render: (e) => (e.anchor_id ? <Badge tone="cyan" icon={<Anchor className="size-3" aria-hidden />}>Yes</Badge> : <Badge tone="neutral">Pending</Badge>),
            },
          ]}
        />
      </Card>
      {selected && <EventDrawer event={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function EventDrawer({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const proof = useAsync(() => auditApi.proof(event.id), [event.id]);
  return (
    <Drawer open onClose={onClose} title={humanize(event.action)}>
      <div className="flex flex-col gap-5">
        <KeyValueList
          items={[
            { label: 'Event', value: <MonoRef value={event.id} /> },
            { label: 'Sequence', value: event.seq, mono: true },
            { label: 'When', value: formatDateTime(event.occurred_at) },
            { label: 'Actor', value: <MonoRef value={event.actor} /> },
            { label: 'Roles', value: event.actor_roles?.join(', ') || '—' },
            ...(event.on_behalf_of ? [{ label: 'On behalf of', value: <MonoRef value={event.on_behalf_of} /> }] : []),
            { label: 'Subject', value: `${event.subject_type} ${event.subject_id}`, mono: true },
            { label: 'Service', value: event.service },
            { label: 'Outcome', value: <StatusBadge status={event.outcome} /> },
            { label: 'Request', value: <MonoRef value={event.request_id} /> },
            { label: 'Hash', value: <MonoRef value={event.hash} /> },
            { label: 'Previous hash', value: <MonoRef value={event.prev_hash} /> },
          ]}
        />
        <JsonBlock label="Before" value={event.before_state} />
        <JsonBlock label="After" value={event.after_state} />
        <JsonBlock label="Metadata" value={event.metadata} />

        <div className="rounded-card border border-line p-4">
          <p className="eyebrow mb-3 text-[11px]">Merkle inclusion proof</p>
          {proof.loading ? (
            <Skeleton className="h-20 w-full" />
          ) : proof.error ? (
            <ErrorState message={apiErrorMessage(proof.error)} onRetry={proof.reload} className="py-4" />
          ) : proof.data && 'leaf' in proof.data ? (
            <div className="flex flex-col gap-3">
              <KeyValueList
                items={[
                  { label: 'Leaf', value: <MonoRef value={proof.data.leaf} /> },
                  { label: 'Merkle root', value: <MonoRef value={proof.data.merkle_root} /> },
                  { label: 'Anchor', value: <><StatusBadge status={proof.data.anchor.status} /> <span className="ml-1 text-xs text-muted">{proof.data.anchor.chain}</span></> },
                  { label: 'Anchor tx', value: <MonoRef value={proof.data.anchor.tx_hash} /> },
                  { label: 'Steps', value: proof.data.proof.length },
                ]}
              />
              <ol className="m-0 flex list-none flex-col gap-1 p-0">
                {proof.data.proof.map((step, i) => (
                  <li key={i} className="flex items-center gap-2 font-mono text-[11.5px] text-navy">
                    <span className="w-10 text-subtle">{step.is_left ? 'left' : 'right'}</span>
                    <span className="truncate">{step.hash}</span>
                  </li>
                ))}
              </ol>
              <p className="text-xs text-muted">{proof.data.verification.steps}</p>
            </div>
          ) : (
            <p className="text-sm text-muted">{proof.data && 'note' in proof.data ? proof.data.note : 'Not anchored yet.'}</p>
          )}
        </div>
      </div>
    </Drawer>
  );
}

function AnchorsTab() {
  const anchors = useAsync(() => auditApi.anchors(100), []);
  return (
    <Card>
      <CardHeader title="Anchors" description="Each anchor commits a contiguous range of events to one Merkle root, published externally." />
      <DataTable
        caption="Audit anchors"
        rows={anchors.data}
        loading={anchors.loading}
        error={anchors.error ? apiErrorMessage(anchors.error) : undefined}
        onRetry={anchors.reload}
        rowKey={(a) => a.id}
        empty={{ icon: <ShieldCheck className="size-6" aria-hidden />, title: 'Nothing anchored yet' }}
        columns={[
          { key: 'range', header: 'Events', render: (a) => <span className="font-mono text-[12.5px]">{a.from_seq}–{a.to_seq}</span> },
          { key: 'count', header: 'Count', render: (a) => a.event_count, hideOnMobile: true },
          { key: 'root', header: 'Merkle root', render: (a) => <MonoRef value={a.merkle_root} /> },
          { key: 'chain', header: 'Published to', render: (a) => (a.tx_hash ? <MonoRef value={a.tx_hash} /> : <span className="flex items-center gap-1 text-subtle"><Link2Off className="size-3.5" aria-hidden />{a.chain || 'not yet'}</span>), hideOnMobile: true },
          { key: 'at', header: 'Created', render: (a) => timeAgo(a.created_at), hideOnMobile: true },
          { key: 'status', header: 'Status', align: 'right', render: (a) => <StatusBadge status={a.status} /> },
        ]}
      />
    </Card>
  );
}
