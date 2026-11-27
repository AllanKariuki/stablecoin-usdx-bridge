import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { FileBarChart, FolderSearch, ListChecks, Siren, UserCheck } from 'lucide-react';
import { approvalsApi, kycApi } from '@damp/web-shared/api';
import { auditApi } from '@damp/web-shared/api/audit';
import { complianceApi } from '@damp/web-shared/api/compliance';
import { reportsApi } from '@damp/web-shared/api/reports';
import { reservesApi } from '@damp/web-shared/api/reserves';
import { useAuth, type Permission } from '@damp/web-shared/auth';
import { humanize, timeAgo, useAsync } from '@damp/web-shared/lib';
import { Card, CountUp, HeroPanel, PulseDot, StatTile, StatusBadge } from '@damp/web-shared/ui';
import { AttentionStrip, type AttentionItem } from '../components/AttentionStrip';
import { QuickActions, RecentlyViewed } from '../components/QuickActions';
import { Section, SeeAll } from '../components/Section';
import { SeverityBadge } from '../components/Severity';
import { WORKSPACE_META, type Workspace } from '../workspace-config';
import { useWorkspace } from '../workspace-context';
import { ReservesDashboard, RunVerdicts } from './treasury/ReservesDashboard';
import { ChainBanner } from './auditor/Audit';

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
};

/**
 * Every workspace's overview has the same frame: a hero with what is waiting
 * on you, a row of counts, then worklists on the left and a rail of quick
 * actions and recently viewed records on the right.
 */
export default function Overview() {
  const { workspace } = useWorkspace();
  const body: Record<Workspace, ReactNode> = {
    compliance: <ComplianceOverview />,
    treasury: <TreasuryOverview />,
    admin: <AdminOverview />,
    auditor: <AuditorOverview />,
  };
  return body[workspace];
}

/** A list fetched only if the user may see it; `allowed: false` means "don't render this". */
function useGated<T>(anyOf: Permission[], load: () => Promise<T[]>) {
  const { can } = useAuth();
  const allowed = can(...anyOf);
  const state = useAsync(() => (allowed ? load() : Promise.resolve([] as T[])), [allowed]);
  return { ...state, allowed, count: state.error ? undefined : state.data?.length };
}
type Gated = { allowed: boolean; count: number | undefined; loading: boolean; error: unknown };

const attention = (key: string, label: string, to: string, g: Gated): AttentionItem[] =>
  g.allowed ? [{ key, label, to, count: g.count, loading: g.loading }] : [];

function OverviewHero({ workspace, description, items }: { workspace: Workspace; description: string; items: AttentionItem[] }) {
  const { user } = useAuth();
  const meta = WORKSPACE_META[workspace];
  return (
    <HeroPanel className="mb-6">
      <header className="flex flex-col gap-5 px-6 py-7 animate-rise sm:px-8 sm:py-9">
        <div className="min-w-0">
          <p className="eyebrow mb-2 inline-flex items-center gap-2 text-cyan">
            <PulseDot /> {meta.label} workspace
          </p>
          <h1 className="m-0 text-[28px] leading-tight text-white sm:text-[36px]">
            {greeting()}
            {user?.name ? `, ${user.name.split(' ')[0]}` : ''}
          </h1>
          <p className="mt-1.5 mb-0 max-w-2xl text-[15px] text-on-navy-muted">{description}</p>
        </div>
        <AttentionStrip items={items} />
      </header>
    </HeroPanel>
  );
}

/** Main column + right rail. */
function Layout({ workspace, children }: { workspace: Workspace; children: ReactNode }) {
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="flex min-w-0 flex-col gap-6">{children}</div>
      <aside className="flex min-w-0 flex-col gap-6" aria-label="Shortcuts">
        <QuickActions workspace={workspace} />
        <RecentlyViewed />
      </aside>
    </div>
  );
}

function CountTile({ g, label, icon, to, note, warn = true, delay }: { g: Gated; label: string; icon: ReactNode; to: string; note: string; warn?: boolean; delay?: 1 | 2 | 3 | 4 | 5 | 6 }) {
  if (!g.allowed) return null;
  return (
    <Link to={to} className="no-underline">
      <StatTile
        label={label}
        icon={icon}
        loading={g.loading}
        tone={warn && (g.count ?? 0) > 0 ? 'warn' : 'default'}
        value={g.count === undefined ? '—' : <CountUp value={g.count} />}
        note={g.error ? 'Couldn’t load' : note}
        reveal
        delay={delay}
      />
    </Link>
  );
}

function Tiles({ children }: { children: ReactNode }) {
  return <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{children}</div>;
}

const icon = (I: typeof Siren) => <I className="size-4" aria-hidden />;

function ComplianceOverview() {
  const kyc = useGated(['kyc:review'], () => kycApi.queue());
  const alerts = useGated(['compliance:cases:manage'], () => complianceApi.alerts('OPEN'));
  const cases = useGated(['compliance:cases:manage'], () => complianceApi.cases('OPEN'));
  const approvals = useGated(['approvals:decide', 'approvals:propose'], () => approvalsApi.list());
  return (
    <>
      <OverviewHero
        workspace="compliance"
        description="What needs attention in compliance today."
        items={[...attention('kyc', 'KYC waiting', '/kyc', kyc), ...attention('alerts', 'open alerts', '/alerts', alerts), ...attention('approvals', 'approvals pending', '/approvals', approvals)]}
      />
      <Tiles>
        <CountTile g={kyc} label="KYC to review" icon={icon(UserCheck)} to="/kyc" note="Applicants waiting on a decision" delay={1} />
        <CountTile g={alerts} label="Open alerts" icon={icon(Siren)} to="/alerts" note="Rule hits not yet triaged" delay={2} />
        <CountTile g={cases} label="Open cases" icon={icon(FolderSearch)} to="/cases" note="Investigations in progress" warn={false} delay={3} />
        <CountTile g={approvals} label="Pending approvals" icon={icon(ListChecks)} to="/approvals" note="Waiting for a second person" delay={4} />
      </Tiles>
      <Layout workspace="compliance">
        {alerts.allowed && (
          <Section title="Newest alerts" action={<SeeAll to="/alerts" />}>
            <ShortList
              loading={alerts.loading}
              empty="No open alerts."
              items={(alerts.data ?? []).slice(0, 6).map((a) => ({ key: a.id, to: '/alerts', left: <SeverityBadge severity={a.severity} />, title: humanize(a.rule), meta: timeAgo(a.createdAt) }))}
            />
          </Section>
        )}
        {kyc.allowed && (
          <Section title="KYC queue" action={<SeeAll to="/kyc" />}>
            <ShortList
              loading={kyc.loading}
              empty="Nobody is waiting."
              items={(kyc.data ?? []).slice(0, 6).map((c) => ({ key: c.id, to: `/kyc/${encodeURIComponent(c.id)}`, left: <StatusBadge status={c.status} />, title: `${c.requestedTier} · ${c.partyId.slice(0, 10)}`, meta: timeAgo(c.submittedAt) }))}
            />
          </Section>
        )}
      </Layout>
    </>
  );
}

function TreasuryOverview() {
  const breaks = useGated(['reserves:read'], () => reservesApi.openBreaks());
  const approvals = useGated(['approvals:decide', 'approvals:propose'], () => approvalsApi.list());
  return (
    <>
      <OverviewHero
        workspace="treasury"
        description="Is every USD-X backed, and do the books, the chains and the bank agree?"
        items={[...attention('breaks', 'open breaks', '/reconciliation?tab=breaks', breaks), ...attention('approvals', 'approvals pending', '/approvals', approvals)]}
      />
      <ReservesDashboard />
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <QuickActions workspace="treasury" />
        <RecentlyViewed />
      </div>
    </>
  );
}

function AdminOverview() {
  const { can } = useAuth();
  const approvals = useGated(['approvals:decide', 'approvals:propose'], () => approvalsApi.list());
  const breaks = useGated(['reserves:read'], () => reservesApi.openBreaks());
  const reports = useGated(['reports:read'], () => reportsApi.runs(20));
  return (
    <>
      <OverviewHero
        workspace="admin"
        description="What needs attention in platform operations today."
        items={[...attention('approvals', 'approvals pending', '/approvals', approvals), ...attention('breaks', 'open breaks', '/reconciliation?tab=breaks', breaks)]}
      />
      <Tiles>
        <CountTile g={approvals} label="Pending approvals" icon={icon(ListChecks)} to="/approvals" note="Waiting for a second person" delay={1} />
        <CountTile g={breaks} label="Open reconciliation breaks" icon={icon(Siren)} to="/reconciliation?tab=breaks" note="Treasury owns these" delay={2} />
        <CountTile g={reports} label="Recent report runs" icon={icon(FileBarChart)} to="/reports" note="Last 20" warn={false} delay={3} />
      </Tiles>
      <Layout workspace="admin">
        {can('audit:read') && (
          <Section title="Audit chain" action={<SeeAll to="/audit" />}>
            <div className="[&>*]:mb-0">
              <ChainBanner />
            </div>
          </Section>
        )}
        {can('reserves:read') && <LatestRuns />}
      </Layout>
    </>
  );
}

function AuditorOverview() {
  const { can } = useAuth();
  const breaks = useGated(['reserves:read'], () => reservesApi.openBreaks());
  const reports = useGated(['reports:read'], () => reportsApi.runs(20));
  const anchors = useGated(['audit:read'], () => auditApi.anchors(5));
  return (
    <>
      <OverviewHero workspace="auditor" description="Read-only oversight: the audit chain, reconciliation and reports." items={attention('breaks', 'open breaks', '/reconciliation?tab=breaks', breaks)} />
      <Tiles>
        <CountTile g={breaks} label="Open reconciliation breaks" icon={icon(Siren)} to="/reconciliation?tab=breaks" note="Raised by reconciliation runs" delay={1} />
        <CountTile g={reports} label="Recent report runs" icon={icon(FileBarChart)} to="/reports" note="Last 20" warn={false} delay={2} />
      </Tiles>
      <Layout workspace="auditor">
        {can('audit:read') && (
          <Section title="Audit chain" action={<SeeAll to="/audit" />}>
            <div className="[&>*]:mb-0">
              <ChainBanner />
            </div>
          </Section>
        )}
        {anchors.allowed && (
          <Section title="Latest anchors" action={<SeeAll to="/audit?tab=anchors" />}>
            <ShortList
              loading={anchors.loading}
              empty="Nothing anchored yet."
              items={(anchors.data ?? []).map((a) => ({ key: a.id, to: '/audit?tab=anchors', left: <StatusBadge status={a.status} />, title: `Events ${a.from_seq}–${a.to_seq}`, meta: timeAgo(a.created_at) }))}
            />
          </Section>
        )}
        {can('reserves:read') && <LatestRuns />}
      </Layout>
    </>
  );
}

function LatestRuns() {
  const runs = useAsync(() => reservesApi.runs(5), []);
  return (
    <Section title="Reconciliation runs" action={<SeeAll to="/reconciliation" />}>
      <ShortList
        loading={runs.loading}
        empty="No reconciliation has run yet."
        items={(runs.data ?? []).map((r) => ({ key: r.id, to: '/reconciliation', left: <RunVerdicts run={r} />, title: '', meta: timeAgo(r.started_at) }))}
      />
    </Section>
  );
}

function ShortList({ items, loading, empty }: { items: Array<{ key: string; to: string; left: ReactNode; title: string; meta: string }>; loading: boolean; empty: string }) {
  return (
    <Card padded={false} className="reveal p-2">
      {loading ? (
        <div className="flex flex-col gap-2 p-2" aria-busy="true">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skeleton block h-10" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="m-0 px-3 py-4 text-sm text-muted">{empty}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col p-0">
          {items.map((i) => (
            <li key={i.key} className="border-b border-line last:border-0">
              <Link to={i.to} className="flex min-h-13 items-center gap-3 rounded-[16px] px-3 py-2 text-sm text-ink no-underline hover:bg-canvas">
                <span className="shrink-0">{i.left}</span>
                <span className="min-w-0 flex-1 truncate font-semibold">{i.title}</span>
                <span className="shrink-0 text-xs text-muted">{i.meta}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
