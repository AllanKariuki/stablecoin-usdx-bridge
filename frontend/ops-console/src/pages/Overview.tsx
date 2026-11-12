import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, FileBarChart, FolderSearch, ListChecks, Siren, UserCheck } from 'lucide-react';
import { approvalsApi, kycApi } from '@damp/web-shared/api';
import { auditApi } from '@damp/web-shared/api/audit';
import { complianceApi } from '@damp/web-shared/api/compliance';
import { reportsApi } from '@damp/web-shared/api/reports';
import { reservesApi } from '@damp/web-shared/api/reserves';
import { useAuth, type Permission } from '@damp/web-shared/auth';
import { humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Card, CardHeader, PageHeader, StatTile, StatusBadge } from '@damp/web-shared/ui';
import { SeverityBadge } from '../components/Severity';
import { WORKSPACE_META, type Workspace } from '../workspace-config';
import { useWorkspace } from '../workspace-context';
import { ReservesDashboard, RunVerdicts } from './treasury/ReservesDashboard';
import { ChainBanner } from './auditor/Audit';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

export default function Overview() {
  const { workspace } = useWorkspace();
  const { user } = useAuth();
  const meta = WORKSPACE_META[workspace];
  const body: Record<Workspace, ReactNode> = {
    compliance: <ComplianceOverview />,
    treasury: <ReservesDashboard />,
    admin: <AdminOverview />,
    auditor: <AuditorOverview />,
  };
  return (
    <>
      <PageHeader
        eyebrow={`${meta.label} workspace`}
        title={`${greeting()}${user?.name ? `, ${user.name.split(' ')[0]}` : ''}`}
        description={workspace === 'treasury' ? 'Is every USD-X backed, and do the books, the chains and the bank agree?' : `What needs attention in ${meta.label.toLowerCase()} today.`}
      />
      {body[workspace]}
    </>
  );
}

/** A count tile that fetches only if the user may, and shows "—" rather than failing the page. */
function CountTile({ label, anyOf, load, icon, to, note, warnAbove = 0 }: { label: string; anyOf: Permission[]; load: () => Promise<unknown[]>; icon: ReactNode; to: string; note: string; warnAbove?: number }) {
  const { can } = useAuth();
  const allowed = can(...anyOf);
  const data = useAsync(() => (allowed ? load() : Promise.resolve(null)), [allowed]);
  if (!allowed) return null;
  const n = data.data ? (data.data as unknown[]).length : undefined;
  return (
    <Link to={to} className="no-underline">
      <StatTile
        label={label}
        icon={icon}
        loading={data.loading}
        tone={n !== undefined && n > warnAbove ? 'warn' : 'default'}
        value={data.error ? '—' : (n ?? '—')}
        note={data.error ? 'Couldn’t load' : note}
      />
    </Link>
  );
}

function PendingApprovalsTile() {
  return <CountTile label="Pending approvals" anyOf={['approvals:decide', 'approvals:propose']} load={() => approvalsApi.list()} icon={<ListChecks className="size-4" aria-hidden />} to="/approvals" note="Waiting for a second person" />;
}

function ComplianceOverview() {
  const alerts = useAsync(() => complianceApi.alerts('OPEN'), []);
  const queue = useAsync(() => kycApi.queue(), []);
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <CountTile label="KYC to review" anyOf={['kyc:review']} load={() => kycApi.queue()} icon={<UserCheck className="size-4" aria-hidden />} to="/kyc" note="Applicants waiting on a decision" />
        <CountTile label="Open alerts" anyOf={['compliance:cases:manage']} load={() => complianceApi.alerts('OPEN')} icon={<Siren className="size-4" aria-hidden />} to="/alerts" note="Rule hits not yet triaged" />
        <CountTile label="Open cases" anyOf={['compliance:cases:manage']} load={() => complianceApi.cases('OPEN')} icon={<FolderSearch className="size-4" aria-hidden />} to="/cases" note="Unassigned investigations" warnAbove={Number.MAX_SAFE_INTEGER} />
        <PendingApprovalsTile />
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Newest alerts" actions={<SeeAll to="/alerts" />} />
          <ShortList
            loading={alerts.loading}
            empty="No open alerts."
            items={(alerts.data ?? []).slice(0, 6).map((a) => ({
              key: a.id,
              to: '/alerts',
              left: <SeverityBadge severity={a.severity} />,
              title: humanize(a.rule),
              meta: timeAgo(a.createdAt),
            }))}
          />
        </Card>
        <Card>
          <CardHeader title="KYC queue" actions={<SeeAll to="/kyc" />} />
          <ShortList
            loading={queue.loading}
            empty="Nobody is waiting."
            items={(queue.data ?? []).slice(0, 6).map((c) => ({
              key: c.id,
              to: `/kyc/${encodeURIComponent(c.id)}`,
              left: <StatusBadge status={c.status} />,
              title: `${c.requestedTier} · ${c.partyId.slice(0, 10)}`,
              meta: timeAgo(c.submittedAt),
            }))}
          />
        </Card>
      </div>
    </div>
  );
}

function AdminOverview() {
  const { can } = useAuth();
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <PendingApprovalsTile />
        <CountTile label="Open reconciliation breaks" anyOf={['reserves:read']} load={() => reservesApi.openBreaks()} icon={<Siren className="size-4" aria-hidden />} to="/reconciliation?tab=breaks" note="Treasury owns these" />
        <CountTile label="Recent report runs" anyOf={['reports:read']} load={() => reportsApi.runs(20)} icon={<FileBarChart className="size-4" aria-hidden />} to="/reports" note="Last 20" warnAbove={Number.MAX_SAFE_INTEGER} />
      </div>
      {can('audit:read') && <ChainBanner />}
      {can('reserves:read') && <LatestRunCard />}
    </div>
  );
}

function AuditorOverview() {
  const { can } = useAuth();
  const anchors = useAsync(() => (can('audit:read') ? auditApi.anchors(5) : Promise.resolve([])), []);
  return (
    <div className="flex flex-col gap-5">
      {can('audit:read') && <ChainBanner />}
      <div className="grid gap-5 lg:grid-cols-2">
        {can('reserves:read') && <LatestRunCard />}
        {can('audit:read') && (
          <Card>
            <CardHeader title="Latest anchors" actions={<SeeAll to="/audit?tab=anchors" />} />
            <ShortList
              loading={anchors.loading}
              empty="Nothing anchored yet."
              items={(anchors.data ?? []).map((a) => ({
                key: a.id,
                to: '/audit?tab=anchors',
                left: <StatusBadge status={a.status} />,
                title: `Events ${a.from_seq}–${a.to_seq}`,
                meta: timeAgo(a.created_at),
              }))}
            />
          </Card>
        )}
      </div>
    </div>
  );
}

function LatestRunCard() {
  const runs = useAsync(() => reservesApi.runs(5), []);
  return (
    <Card>
      <CardHeader title="Reconciliation" description="Latest runs, by leg" actions={<SeeAll to="/reconciliation" />} />
      <ShortList
        loading={runs.loading}
        empty="No reconciliation has run yet."
        items={(runs.data ?? []).map((r) => ({ key: r.id, to: '/reconciliation', left: <RunVerdicts run={r} />, title: '', meta: timeAgo(r.started_at) }))}
      />
    </Card>
  );
}

function SeeAll({ to }: { to: string }) {
  return (
    <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-action no-underline hover:underline">
      See all <ArrowRight className="size-4" aria-hidden />
    </Link>
  );
}

function ShortList({ items, loading, empty }: { items: Array<{ key: string; to: string; left: ReactNode; title: string; meta: string }>; loading: boolean; empty: string }) {
  if (loading) {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="skeleton block h-10" />
        ))}
      </div>
    );
  }
  if (items.length === 0) return <p className="py-4 text-sm text-muted">{empty}</p>;
  return (
    <ul className="m-0 flex list-none flex-col p-0">
      {items.map((i) => (
        <li key={i.key} className="border-b border-line last:border-0">
          <Link to={i.to} className="flex min-h-12 items-center gap-3 rounded-[10px] px-1 py-2 text-sm text-ink no-underline hover:bg-canvas">
            <span className="shrink-0">{i.left}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{i.title}</span>
            <span className="shrink-0 text-xs text-muted">{i.meta}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
