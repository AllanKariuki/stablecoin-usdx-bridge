import { useNavigate } from 'react-router-dom';
import { UserCheck } from 'lucide-react';
import { apiErrorMessage, kycApi } from '@damp/web-shared/api';
import { formatDateTime, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Card, DataTable, PageHeader, StatusBadge } from '@damp/web-shared/ui';
import { ListToolbar, SummaryStrip } from '../../components/ListToolbar';
import { PAGE_SIZES, useSearch } from '../../list';

export default function KycQueue() {
  const navigate = useNavigate();
  const queue = useAsync(() => kycApi.queue(), []);
  const search = useSearch(queue.data, (c) => [c.partyId, c.requestedTier, c.status]);
  const rows = queue.data ?? [];
  const dayAgo = Date.now() - 24 * 3600 * 1000;
  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="KYC review"
        description="Submissions the screening provider flagged for a person to look at. Oldest first — the applicant is waiting."
      />
      <SummaryStrip
        loading={queue.loading}
        items={[
          { label: 'Waiting for review', value: rows.length, tone: 'action' },
          { label: 'Waiting over a day', value: rows.filter((c) => c.submittedAt !== null && new Date(c.submittedAt).getTime() < dayAgo).length, tone: 'warn' },
          { label: 'Risk score 70+', value: rows.filter((c) => (c.riskScore ?? 0) >= 70).length, tone: 'cyan' },
        ]}
      />
      <Card className="reveal">
        <ListToolbar search={{ value: search.query, onChange: search.setQuery, placeholder: 'Search party or tier' }} />
        <DataTable
          caption="KYC review queue"
          rows={search.filtered}
          pageSize={10}
          pageSizeOptions={PAGE_SIZES}
          resetKey={search.query}
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
