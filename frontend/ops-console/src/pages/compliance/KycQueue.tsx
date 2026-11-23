import { useNavigate } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import { apiErrorMessage, kycApi } from '@damp/web-shared/api';
import { formatDateTime, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Card, DataTable, PageHeader, StatusBadge } from '@damp/web-shared/ui';

export default function KycQueue() {
  const navigate = useNavigate();
  const queue = useAsync(() => kycApi.queue(), []);
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="KYC review"
        description="Submissions the screening provider flagged for a person to look at. Oldest first — the applicant is waiting."
      />
      <Card className="reveal">
        <DataTable
          caption="KYC review queue"
          rows={queue.data}
          loading={queue.loading}
          error={queue.error ? apiErrorMessage(queue.error) : undefined}
          onRetry={queue.reload}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/kyc/${encodeURIComponent(c.id)}`)}
          empty={{ icon: <UserCheck className="size-6" aria-hidden />, title: 'Queue is clear', body: 'No KYC submissions are waiting for review.' }}
          columns={[
            { key: 'party', header: 'Party', render: (c) => <span className="font-mono text-[12.5px] text-navy">{c.partyId}</span> },
            { key: 'tier', header: 'Requested tier', render: (c) => <span className="font-semibold">{c.requestedTier}</span> },
            {
              key: 'risk',
              header: 'Risk score',
              render: (c) => (c.riskScore === null ? <span className="text-subtle">—</span> : <span className="font-mono tabular-nums">{c.riskScore}</span>),
            },
            { key: 'submitted', header: 'Submitted', render: (c) => <span title={formatDateTime(c.submittedAt)}>{timeAgo(c.submittedAt)}</span>, hideOnMobile: true },
            { key: 'status', header: 'Status', align: 'right', render: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
      </Card>
    </>
  );
}
