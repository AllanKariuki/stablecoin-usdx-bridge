import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FolderSearch } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { complianceApi } from '@damp/web-shared/api/compliance';
import { timeAgo, useAsync } from '@damp/web-shared/lib';
import { Card, DataTable, PageHeader, Segmented, StatusBadge } from '@damp/web-shared/ui';
import { SeverityBadge } from '../../components/Severity';

export default function Cases() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>('');
  const cases = useAsync(() => complianceApi.cases(status || undefined), [status]);

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Cases"
        description="Investigations opened from alerts. Close as cleared, or file a SAR with a narrative."
        actions={
          <Segmented
            label="Case status"
            value={status}
            onChange={setStatus}
            options={[
              { value: '', label: 'All' },
              { value: 'OPEN', label: 'Open' },
              { value: 'INVESTIGATING', label: 'Investigating' },
              { value: 'CLOSED_SAR', label: 'SAR filed' },
              { value: 'CLOSED_CLEARED', label: 'Cleared' },
            ]}
          />
        }
      />
      <Card>
        <DataTable
          caption="Compliance cases"
          rows={cases.data}
          loading={cases.loading}
          error={cases.error ? apiErrorMessage(cases.error) : undefined}
          onRetry={cases.reload}
          rowKey={(c) => c.id}
          onRowClick={(c) => navigate(`/cases/${encodeURIComponent(c.id)}`)}
          empty={{ icon: <FolderSearch className="size-6" aria-hidden />, title: 'No cases', body: 'Cases appear here when an alert is escalated.' }}
          columns={[
            { key: 'ref', header: 'Reference', render: (c) => <span className="font-mono text-[12.5px] font-semibold text-navy">{c.reference}</span> },
            { key: 'title', header: 'Title', render: (c) => <span className="text-ink">{c.title}</span> },
            { key: 'sev', header: 'Severity', render: (c) => <SeverityBadge severity={c.severity} />, hideOnMobile: true },
            { key: 'owner', header: 'Assigned', render: (c) => (c.assignedTo ? <span className="font-mono text-[12.5px]">{c.assignedTo.slice(0, 12)}</span> : <span className="text-subtle">Unassigned</span>), hideOnMobile: true },
            { key: 'age', header: 'Opened', render: (c) => <span className="text-[13px] text-muted">{timeAgo(c.createdAt)}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (c) => <StatusBadge status={c.status} /> },
          ]}
        />
      </Card>
    </>
  );
}
