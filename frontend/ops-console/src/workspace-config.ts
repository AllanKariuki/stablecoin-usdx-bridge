import {
  Activity,
  ArrowLeftRight,
  Banknote,
  BookOpenCheck,
  Building2,
  FileBarChart,
  FileCheck2,
  Gavel,
  LayoutDashboard,
  Link2,
  ListChecks,
  Radar,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Siren,
  UserCheck,
  Users,
  Wallet,
} from 'lucide-react';
import type { NavGroup, NavItem } from '@damp/web-shared/layout';

/**
 * One console, four workspaces. A workspace is a staff role's view of the
 * console: which nav groups and which overview it gets. It is not a
 * permission boundary — routes are gated by permission, and the API's 403 is
 * the real gate — so a user holding two staff roles switches between views
 * of the same session, not between sessions.
 */
export type Workspace = 'admin' | 'compliance' | 'treasury' | 'auditor';

export const STAFF_ROLES: Workspace[] = ['compliance', 'treasury', 'admin', 'auditor'];

export const WORKSPACE_META: Record<Workspace, { label: string; blurb: string; icon: typeof ShieldCheck }> = {
  compliance: { label: 'Compliance', blurb: 'KYC, alerts, cases, enforcement', icon: ShieldAlert },
  treasury: { label: 'Treasury', blurb: 'Reserves, reconciliation, ledger', icon: Banknote },
  admin: { label: 'Admin', blurb: 'Platform operations', icon: Building2 },
  auditor: { label: 'Auditor', blurb: 'Read-only oversight', icon: BookOpenCheck },
};

const lookup: NavGroup = {
  label: 'Lookup',
  items: [
    { to: '/wallets', label: 'Wallets', icon: Wallet, anyOf: ['wallets:read:any'] },
    { to: '/transactions', label: 'Transactions', icon: ArrowLeftRight, anyOf: ['transactions:read:any'] },
  ],
};

const approvals: NavItem = { to: '/approvals', label: 'Approvals', icon: ListChecks, anyOf: ['approvals:decide', 'approvals:propose'] };

export const WORKSPACE_NAV: Record<Workspace, NavGroup[]> = {
  compliance: [
    { items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }] },
    {
      label: 'Compliance',
      items: [
        { to: '/kyc', label: 'KYC review', icon: UserCheck, anyOf: ['kyc:review'] },
        { to: '/alerts', label: 'Alerts', icon: Siren, anyOf: ['compliance:cases:manage'] },
        { to: '/cases', label: 'Cases', icon: FileCheck2, anyOf: ['compliance:cases:manage'] },
        { to: '/enforcement', label: 'Enforcement', icon: Gavel, anyOf: ['compliance:cases:manage', 'compliance:blacklist:manage'] },
        { to: '/screening', label: 'Screening', icon: Radar, anyOf: ['compliance:cases:manage'] },
        approvals,
      ],
    },
    lookup,
  ],
  treasury: [
    { items: [{ to: '/', label: 'Reserves overview', icon: LayoutDashboard, end: true }] },
    {
      label: 'Treasury',
      items: [
        { to: '/reconciliation', label: 'Reconciliation', icon: Activity, anyOf: ['reserves:read'] },
        { to: '/custodians', label: 'Custodians', icon: Building2, anyOf: ['reserves:read'] },
        { to: '/attestations', label: 'Attestations', icon: ShieldCheck, anyOf: ['reserves:read'] },
        { to: '/ledger', label: 'Ledger', icon: ScrollText, anyOf: ['ledger:read'] },
        { to: '/reports', label: 'Reports', icon: FileBarChart, anyOf: ['reports:read'] },
        approvals,
      ],
    },
    lookup,
  ],
  admin: [
    { items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }] },
    {
      label: 'Operations',
      items: [
        { to: '/directory', label: 'Users & orgs', icon: Users, anyOf: ['admin:users:manage'] },
        approvals,
        { to: '/reconciliation', label: 'Reconciliation', icon: Activity, anyOf: ['reserves:read'] },
        { to: '/reports', label: 'Reports', icon: FileBarChart, anyOf: ['reports:read'] },
        { to: '/audit', label: 'Audit trail', icon: Link2, anyOf: ['audit:read'] },
      ],
    },
    lookup,
  ],
  auditor: [
    { items: [{ to: '/', label: 'Overview', icon: LayoutDashboard, end: true }] },
    {
      label: 'Evidence',
      items: [
        { to: '/audit', label: 'Audit trail', icon: Link2, anyOf: ['audit:read'] },
        { to: '/reports', label: 'Reports', icon: FileBarChart, anyOf: ['reports:read'] },
        { to: '/reconciliation', label: 'Reconciliation', icon: Activity, anyOf: ['reserves:read'] },
        { to: '/attestations', label: 'Attestations', icon: ShieldCheck, anyOf: ['reserves:read'] },
        { to: '/ledger', label: 'Ledger', icon: ScrollText, anyOf: ['ledger:read'] },
        approvals,
      ],
    },
    lookup,
  ],
};
