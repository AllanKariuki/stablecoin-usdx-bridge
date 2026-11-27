import { useState } from 'react';
import { Link } from 'react-router-dom';
import { BellOff, Siren } from 'lucide-react';
import { apiErrorMessage } from '@damp/web-shared/api';
import { complianceApi, type ComplianceAlert } from '@damp/web-shared/api/compliance';
import { Can } from '@damp/web-shared/auth';
import { formatDateTime, humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Button, Card, ConfirmDialog, DataTable, Drawer, KeyValueList, MonoRef, PageHeader, Segmented, StatusBadge } from '@damp/web-shared/ui';
import { JsonBlock } from '../../components/JsonBlock';
import { ListToolbar, SummaryStrip } from '../../components/ListToolbar';
import { PAGE_SIZES, useSearch } from '../../list';
import { SeverityBadge } from '../../components/Severity';

export default function Alerts() {
  const [status, setStatus] = useState('OPEN');
  const alerts = useAsync(() => complianceApi.alerts(status), [status]);
  const [selected, setSelected] = useState<ComplianceAlert | null>(null);
  const [dismissing, setDismissing] = useState(false);
  const search = useSearch(alerts.data, (a) => [humanize(a.rule), a.rule, a.partyId, a.detail, a.severity]);
  const bySeverity = (re: RegExp) => (alerts.data ?? []).filter((a) => re.test(a.severity)).length;

  return (
    <>
      <PageHeader
        eyebrow="Compliance"
        title="Alerts"
        description="Rule hits from transaction monitoring and screening. Dismiss with a reason, or work them inside a case."
      />
      <SummaryStrip
        loading={alerts.loading}
        items={[
          { label: status === 'OPEN' ? 'Open alerts' : 'Alerts shown', value: alerts.data?.length ?? 0, tone: 'action' },
          { label: 'High or critical', value: bySeverity(/crit|high/i), tone: 'warn' },
          { label: 'Medium', value: bySeverity(/med/i), tone: 'cyan' },
          { label: 'Low', value: bySeverity(/low/i) },
        ]}
      />
      <Card className="reveal">
        <ListToolbar search={{ value: search.query, onChange: search.setQuery, placeholder: 'Search rule, party or detail' }}>
          <Segmented
            label="Alert status"
            value={status}
            onChange={setStatus}
            options={[
              { value: 'OPEN', label: 'Open' },
              { value: 'DISMISSED', label: 'Dismissed' },
              { value: 'ALL', label: 'All' },
            ]}
          />
        </ListToolbar>
        <DataTable
          caption="Compliance alerts"
          rows={search.filtered}
          pageSize={10}
          pageSizeOptions={PAGE_SIZES}
          resetKey={`${status}|${search.query}`}
          loading={alerts.loading}
          error={alerts.error ? apiErrorMessage(alerts.error) : undefined}
          onRetry={alerts.reload}
          rowKey={(a) => a.id}
          onRowClick={setSelected}
          empty={{ icon: <Siren className="size-6" aria-hidden />, title: 'No alerts here', body: status === 'OPEN' ? 'Nothing needs attention right now.' : 'No alerts match this filter.' }}
          columns={[
            { key: 'sev', header: 'Severity', render: (a) => <SeverityBadge severity={a.severity} /> },
            { key: 'rule', header: 'Rule', render: (a) => <span className="font-semibold text-ink">{humanize(a.rule)}</span> },
            { key: 'detail', header: 'Detail', render: (a) => <span className="line-clamp-1 text-[13px] text-muted">{a.detail}</span>, hideOnMobile: true },
            { key: 'party', header: 'Party', render: (a) => <span className="font-mono text-[12.5px]">{a.partyId.slice(0, 12)}</span>, hideOnMobile: true },
            { key: 'at', header: 'Raised', render: (a) => <span className="text-[13px] text-muted">{timeAgo(a.createdAt)}</span> },
            { key: 'status', header: 'Status', align: 'right', render: (a) => <StatusBadge status={a.status} /> },
          ]}
        />
      </Card>

      {selected && (
        <Drawer
          open
          onClose={() => setSelected(null)}
          title={humanize(selected.rule)}
          footer={
            selected.status === 'OPEN' && (
              <Can anyOf={['compliance:cases:manage']}>
                <Button variant="warn" icon={<BellOff className="size-4" aria-hidden />} onClick={() => setDismissing(true)}>
                  Dismiss…
                </Button>
              </Can>
            )
          }
        >
          <div className="flex flex-col gap-5">
            <KeyValueList
              items={[
                { label: 'Severity', value: <SeverityBadge severity={selected.severity} /> },
                { label: 'Status', value: <StatusBadge status={selected.status} /> },
                { label: 'Raised', value: formatDateTime(selected.createdAt) },
                { label: 'Party', value: <MonoRef value={selected.partyId} /> },
                {
                  label: 'Transaction',
                  value: selected.transactionId ? <Link to={`/transactions/${encodeURIComponent(selected.transactionId)}`} className="font-mono text-[13px]">{selected.transactionId}</Link> : '—',
                },
                { label: 'Case', value: selected.caseId ? <Link to={`/cases/${encodeURIComponent(selected.caseId)}`} className="font-mono text-[13px]">{selected.caseId}</Link> : 'Not in a case' },
              ]}
            />
            <p className="text-sm leading-relaxed text-ink">{selected.detail}</p>
            <JsonBlock label="Evidence" value={selected.evidence} />
          </div>
          <ConfirmDialog
            open={dismissing}
            onClose={() => setDismissing(false)}
            title="Dismiss this alert?"
            variant="warn"
            confirmLabel="Dismiss alert"
            requireReason
            reasonLabel="Why is this not suspicious?"
            consequence="The alert closes without a case. Your reason is kept with it and in the audit trail; the rule will still fire on new activity."
            onConfirm={async (reason) => {
              try {
                await complianceApi.dismissAlert(selected.id, reason);
                setSelected(null);
                alerts.reload();
              } catch (err) {
                throw new Error(apiErrorMessage(err));
              }
            }}
          />
        </Drawer>
      )}
    </>
  );
}
