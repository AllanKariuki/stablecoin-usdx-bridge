import { useState } from 'react';
import { CheckSquare } from 'lucide-react';
import { apiErrorMessage, approvalsApi, type ApprovalRequest } from '@damp/web-shared/api';
import { Can, useAuth } from '@damp/web-shared/auth';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, Callout, Card, ConfirmDialog, DataTable, Drawer, KeyValueList, MonoRef, PageHeader, PulseDot, StatusBadge } from '@damp/web-shared/ui';

/** Renders an approval's summary object as label/value rows; never trusts it as markup. */
function Summary({ summary }: { summary: Record<string, unknown> }) {
  const entries = Object.entries(summary ?? {});
  if (!entries.length) return <p className="text-sm text-muted">No summary was attached.</p>;
  return (
    <KeyValueList
      items={entries.map(([k, v]) => ({
        label: humanize(k.replace(/([a-z])([A-Z])/g, '$1_$2')),
        value: typeof v === 'object' && v !== null ? <span className="font-mono text-xs">{JSON.stringify(v)}</span> : String(v),
      }))}
    />
  );
}

/**
 * Maker-checker inbox (services/workflow). The approver sees exactly what
 * they're agreeing to — the summary and the payload digest the acting
 * service re-checks before it acts — and can't approve their own request.
 */
export default function ApprovalsPage() {
  const { user } = useAuth();
  const requests = useAsync(() => approvalsApi.list(), []);
  const [open, setOpen] = useState<ApprovalRequest | null>(null);
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  const mine = open?.requestedBy === user?.id;

  return (
    <>
      <PageHeader eyebrow="Approvals" title="Awaiting approval" description="Payouts over your organisation’s limit need a second person to approve them." />
      <Card>
        <DataTable
          caption="Pending approval requests"
          rows={requests.data}
          loading={requests.loading}
          error={requests.error ? apiErrorMessage(requests.error) : undefined}
          onRetry={requests.reload}
          rowKey={(r) => r.id}
          onRowClick={setOpen}
          empty={{ title: 'Nothing waiting for you', body: 'Requests that need your approval will appear here.', icon: <CheckSquare className="size-6" aria-hidden /> }}
          columns={[
            { key: 'action', header: 'Request', render: (r) => <span className="font-semibold text-ink">{humanize(r.action)}</span> },
            { key: 'subject', header: 'Subject', hideOnMobile: true, render: (r) => <MonoRef value={r.subjectId} /> },
            { key: 'by', header: 'Requested', render: (r) => <span className="text-muted">{timeAgo(r.createdAt ?? r.expiresAt)}</span> },
            { key: 'expires', header: 'Expires', hideOnMobile: true, render: (r) => <span className="text-muted">{formatDateTime(r.expiresAt)}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (r) => (r.status === 'PENDING' ? <Badge tone="warn" icon={<PulseDot tone="warn" />}>Waiting on a second approver</Badge> : <StatusBadge status={r.status} />) },
          ]}
        />
      </Card>

      <Drawer
        open={open !== null}
        onClose={() => setOpen(null)}
        title={open ? humanize(open.action) : ''}
        footer={
          open?.status === 'PENDING' && !mine ? (
            <Can anyOf={['approvals:decide']}>
              <Button variant="warn" onClick={() => setDecision('reject')}>
                Reject…
              </Button>
              <Button onClick={() => setDecision('approve')}>Approve…</Button>
            </Can>
          ) : undefined
        }
      >
        {open && (
          <div className="flex flex-col gap-5">
            <div className="flex items-center gap-2">
              <StatusBadge status={open.status} />
              <span className="text-xs text-muted">Expires {formatDateTime(open.expiresAt)}</span>
            </div>
            {mine && <Callout tone="info">You opened this request, so someone else has to decide it.</Callout>}
            {open.reason && (
              <div>
                <h3 className="eyebrow mb-1">Reason given</h3>
                <p className="text-sm text-ink">{open.reason}</p>
              </div>
            )}
            <div>
              <h3 className="eyebrow mb-1">What you’re approving</h3>
              <Summary summary={open.summary} />
            </div>
            <KeyValueList
              items={[
                { label: 'Subject', value: <MonoRef value={`${open.subjectType}:${open.subjectId}`} /> },
                { label: 'Payload digest', value: <MonoRef value={open.payloadDigest} /> },
                { label: 'Request', value: <MonoRef value={open.id} /> },
              ]}
            />
            {open.approvals.length > 0 && (
              <div>
                <h3 className="eyebrow mb-1">Decisions so far</h3>
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {open.approvals.map((a, i) => (
                    <li key={i} className="rounded-[12px] bg-canvas px-3 py-2 text-sm">
                      <StatusBadge status={a.decision} /> <span className="font-mono text-xs text-muted">{a.decidedBy}</span> · {formatDateTime(a.at)}
                      {a.comment && <p className="mt-1 text-[13px] text-ink">“{a.comment}”</p>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision === 'approve' ? 'Approve this request?' : 'Reject this request?'}
        confirmLabel={decision === 'approve' ? 'Approve' : 'Reject'}
        variant={decision === 'approve' ? 'primary' : 'warn'}
        requireReason={decision === 'reject'}
        reasonLabel="Why are you rejecting it?"
        consequence={
          decision === 'approve'
            ? 'Once enough people approve, the payout goes ahead exactly as summarised — the digest above is checked before anything moves.'
            : 'The payout will not happen. The requester sees your reason.'
        }
        onConfirm={async (reason) => {
          try {
            if (decision === 'approve') await approvalsApi.approve(open!.id, reason || undefined);
            else await approvalsApi.reject(open!.id, reason);
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
          setOpen(null);
          requests.reload();
        }}
      />
    </>
  );
}
