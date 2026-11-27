import { useState } from 'react';
import { Check, ListChecks, X } from 'lucide-react';
import { apiErrorMessage, approvalsApi, type ApprovalRequest } from '@damp/web-shared/api';
import { Can, useAuth } from '@damp/web-shared/auth';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Badge, Button, Callout, Card, ConfirmDialog, DataTable, Drawer, KeyValueList, MonoRef, PageHeader, PulseDot, StatusBadge } from '@damp/web-shared/ui';
import { JsonBlock } from '../components/JsonBlock';
import { ListToolbar, SummaryStrip } from '../components/ListToolbar';
import { PAGE_SIZES, useSearch } from '../list';

/**
 * Maker-checker queue (services/workflow). The approver confirms a payload
 * digest, not a description: the acting service re-checks the digest
 * before it acts, so what is shown here is exactly what will happen.
 */
export default function Approvals() {
  const requests = useAsync(() => approvalsApi.list(), []);
  const policies = useAsync(() => approvalsApi.policies(), []);
  const [selected, setSelected] = useState<ApprovalRequest | null>(null);

  const policyFor = (action: string) => policies.data?.find((p) => p.action === action);
  const search = useSearch(requests.data, (r) => [humanize(r.action), r.action, r.subjectType, r.subjectId, r.requestedBy]);
  const rows = requests.data ?? [];
  const soon = Date.now() + 24 * 3600 * 1000;

  return (
    <>
      <PageHeader
        eyebrow="Maker-checker"
        title="Approvals"
        description="Requests waiting for a second person. Each one names the exact payload you are agreeing to."
      />
      <SummaryStrip
        loading={requests.loading}
        items={[
          { label: 'Waiting for a decision', value: rows.filter((r) => r.status === 'PENDING').length, tone: 'action' },
          { label: 'Expiring within a day', value: rows.filter((r) => r.status === 'PENDING' && new Date(r.expiresAt).getTime() < soon).length, tone: 'warn' },
          { label: 'Action types', value: new Set(rows.map((r) => r.action)).size, tone: 'cyan' },
        ]}
      />
      <Card className="reveal">
        <ListToolbar search={{ value: search.query, onChange: search.setQuery, placeholder: 'Search action, subject or requester' }} />
        <DataTable
          caption="Pending approval requests"
          rows={search.filtered}
          pageSize={10}
          pageSizeOptions={PAGE_SIZES}
          resetKey={search.query}
          loading={requests.loading}
          error={requests.error ? apiErrorMessage(requests.error) : undefined}
          onRetry={requests.reload}
          rowKey={(r) => r.id}
          onRowClick={setSelected}
          empty={{ icon: <ListChecks className="size-6" aria-hidden />, title: 'Nothing waiting', body: 'Pending requests that need a second approver appear here.' }}
          columns={[
            { key: 'action', header: 'Action', render: (r) => <span className="font-semibold text-ink">{humanize(r.action)}</span> },
            { key: 'subject', header: 'Subject', render: (r) => <span className="font-mono text-[12.5px] text-navy">{r.subjectType}:{r.subjectId.slice(0, 12)}</span>, hideOnMobile: true },
            { key: 'by', header: 'Requested by', render: (r) => <span className="font-mono text-[12.5px]">{r.requestedBy.slice(0, 10)}</span>, hideOnMobile: true },
            {
              key: 'progress',
              header: 'Approvals',
              render: (r) => {
                const needed = policyFor(r.action)?.approvalsRequired;
                const got = r.approvals.filter((a) => a.decision === 'APPROVE' || a.decision === 'APPROVED').length;
                if (needed !== undefined) return <span className="text-[13px] font-semibold tabular-nums">{`${got} of ${needed}`}</span>;
                if (r.status === 'PENDING') return <Badge tone="warn" icon={<PulseDot tone="warn" />}>Waiting on a second approver</Badge>;
                return <span className="text-[13px] font-semibold tabular-nums">{got}</span>;
              },
            },
            { key: 'expires', header: 'Expires', render: (r) => <span className="text-[13px] text-muted">{timeAgo(r.expiresAt)}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (r) => <StatusBadge status={r.status} /> },
          ]}
        />
      </Card>

      <ApprovalDrawer
        request={selected}
        onClose={() => setSelected(null)}
        approvalsRequired={selected ? policyFor(selected.action)?.approvalsRequired : undefined}
        onDecided={() => {
          setSelected(null);
          requests.reload();
        }}
      />
    </>
  );
}

function ApprovalDrawer({
  request,
  onClose,
  onDecided,
  approvalsRequired,
}: {
  request: ApprovalRequest | null;
  onClose: () => void;
  onDecided: () => void;
  approvalsRequired?: number;
}) {
  const { user } = useAuth();
  const [decision, setDecision] = useState<'approve' | 'reject' | null>(null);
  if (!request) return null;
  const ownRequest = request.requestedBy === user?.id;
  const pending = request.status === 'PENDING';

  return (
    <Drawer
      open
      onClose={onClose}
      title={humanize(request.action)}
      footer={
        pending && (
          <Can anyOf={['approvals:decide']}>
            <Button variant="warn" icon={<X className="size-4" aria-hidden />} onClick={() => setDecision('reject')} disabled={ownRequest}>
              Reject…
            </Button>
            <Button icon={<Check className="size-4" aria-hidden />} onClick={() => setDecision('approve')} disabled={ownRequest}>
              Approve…
            </Button>
          </Can>
        )
      }
    >
      <div className="flex flex-col gap-5">
        {ownRequest && pending && (
          <Callout tone="info" title="You opened this request">
            Someone else has to decide it — the proposer can't approve their own request.
          </Callout>
        )}
        <KeyValueList
          items={[
            { label: 'Status', value: <StatusBadge status={request.status} /> },
            { label: 'Subject', value: `${request.subjectType} ${request.subjectId}`, mono: true },
            { label: 'Requested by', value: request.requestedBy, mono: true },
            { label: 'Reason', value: request.reason || '—' },
            { label: 'Approvals needed', value: approvalsRequired ?? '—' },
            { label: 'Expires', value: formatDateTime(request.expiresAt) },
            { label: 'Payload digest', value: <MonoRef value={request.payloadDigest} /> },
          ]}
        />
        <JsonBlock label="What you are approving" value={request.summary} />
        <div>
          <p className="eyebrow mb-2 text-[11px]">Decisions so far</p>
          {request.approvals.length === 0 ? (
            <p className="text-sm text-subtle">No decisions yet.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {request.approvals.map((a, i) => (
                <li key={i} className="rounded-[12px] border border-line p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge status={a.decision.startsWith('APPROVE') ? 'APPROVED' : 'REJECTED'} />
                    <span className="text-xs text-muted">{formatDateTime(a.at)}</span>
                  </div>
                  <p className="mt-1.5 font-mono text-[12px] text-navy">{a.decidedBy}</p>
                  {a.comment && <p className="mt-1 text-[13px] text-neutral-ink">{a.comment}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={decision !== null}
        onClose={() => setDecision(null)}
        title={decision === 'approve' ? 'Approve this request?' : 'Reject this request?'}
        variant={decision === 'approve' ? 'primary' : 'warn'}
        confirmLabel={decision === 'approve' ? 'Approve' : 'Reject'}
        requireReason={decision === 'reject'}
        reasonLabel="Why are you rejecting it?"
        consequence={
          decision === 'approve' ? (
            <>
              Your approval counts towards the {approvalsRequired ?? 'required'} needed. When the last one lands, the owning service re-checks
              digest <span className="font-mono">{request.payloadDigest.slice(0, 12)}…</span> and then carries out the action.
            </>
          ) : (
            'The request closes as rejected and the action will not happen. The proposer has to open a new request to try again.'
          )
        }
        onConfirm={async (comment) => {
          try {
            if (decision === 'approve') await approvalsApi.approve(request.id, comment || undefined);
            else await approvalsApi.reject(request.id, comment);
            onDecided();
          } catch (err) {
            throw new Error(apiErrorMessage(err));
          }
        }}
      />
    </Drawer>
  );
}
