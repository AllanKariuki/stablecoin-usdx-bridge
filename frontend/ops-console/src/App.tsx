import { lazy, Suspense, type ReactNode } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { AuthCallback, RequireAuth, RequirePermission, RequireRole, useAuth, type Permission } from '@damp/web-shared/auth';
import { AppRoot, AppShell } from '@damp/web-shared/layout';
import { NotFoundPage } from '@damp/web-shared/pages';
import { FullPageLoader, SkeletonRows } from '@damp/web-shared/ui';
import { GlobalSearch } from './components/GlobalSearch';
import StaffEntry, { PORTAL_URL } from './pages/StaffEntry';
import { STAFF_ROLES, WORKSPACE_META, WORKSPACE_NAV } from './workspace-config';
import { useWorkspace } from './workspace-context';
import { WorkspaceProvider, WorkspaceSwitcher } from './workspaces';

const Overview = lazy(() => import('./pages/Overview'));
const WalletLookup = lazy(() => import('./pages/Lookup').then((m) => ({ default: m.WalletLookup })));
const TransactionLookup = lazy(() => import('./pages/Lookup').then((m) => ({ default: m.TransactionLookup })));
const WalletDetail = lazy(() => import('./pages/WalletDetail'));
const TransactionDetail = lazy(() => import('./pages/TransactionDetail'));
const Approvals = lazy(() => import('./pages/Approvals'));
const KycQueue = lazy(() => import('./pages/compliance/KycQueue'));
const KycCase = lazy(() => import('./pages/compliance/KycCase'));
const Alerts = lazy(() => import('./pages/compliance/Alerts'));
const Cases = lazy(() => import('./pages/compliance/Cases'));
const CaseDetail = lazy(() => import('./pages/compliance/CaseDetail'));
const Enforcement = lazy(() => import('./pages/compliance/Enforcement'));
const Screening = lazy(() => import('./pages/compliance/Screening'));
const Reconciliation = lazy(() => import('./pages/treasury/Reconciliation'));
const Custodians = lazy(() => import('./pages/treasury/Custodians'));
const Attestations = lazy(() => import('./pages/treasury/Attestations'));
const Ledger = lazy(() => import('./pages/treasury/Ledger'));
const Exposure = lazy(() => import('./pages/treasury/Exposure'));
const PricingPairs = lazy(() => import('./pages/treasury/PricingPairs'));
const Audit = lazy(() => import('./pages/auditor/Audit'));
const Reports = lazy(() => import('./pages/auditor/Reports'));
const Directory = lazy(() => import('./pages/admin/Directory'));

const gated = (anyOf: Permission[], page: ReactNode) => <RequirePermission anyOf={anyOf}>{page}</RequirePermission>;

/**
 * The console's front door: an anonymous staff entry at `/`, the loading
 * spinner while the session is checked, and the gated shell everywhere else.
 * Deep links keep RequireAuth's auto-redirect to Keycloak.
 */
function ConsoleEntry() {
  const { status } = useAuth();
  const location = useLocation();
  if (location.pathname === '/') {
    if (status === 'loading') return <FullPageLoader label="Checking your session" />;
    if (status === 'anonymous') return <StaffEntry />;
  }
  return (
    <RequireAuth>
      <RequireRole roles={STAFF_ROLES} elsewhere={{ label: 'Go to the DAMP portal', href: PORTAL_URL }}>
        <WorkspaceProvider>
          <ConsoleShell />
        </WorkspaceProvider>
      </RequireRole>
    </RequireAuth>
  );
}

function ConsoleShell() {
  const { workspace } = useWorkspace();
  return (
    <AppShell
      appName={`Ops Console · ${WORKSPACE_META[workspace].label}`}
      nav={WORKSPACE_NAV[workspace]}
      context={<WorkspaceSwitcher />}
      topbar={<GlobalSearch />}
    >
      <Suspense fallback={<SkeletonRows rows={6} className="mt-6" />}>
        <Routes>
          <Route index element={<Overview />} />
          <Route path="wallets" element={gated(['wallets:read:any'], <WalletLookup />)} />
          <Route path="wallets/:walletId" element={gated(['wallets:read:any'], <WalletDetail />)} />
          <Route path="transactions" element={gated(['transactions:read:any'], <TransactionLookup />)} />
          <Route path="transactions/:transactionId" element={gated(['transactions:read:any'], <TransactionDetail />)} />
          <Route path="approvals" element={gated(['approvals:decide', 'approvals:propose'], <Approvals />)} />

          <Route path="kyc" element={gated(['kyc:review'], <KycQueue />)} />
          <Route path="kyc/:caseId" element={gated(['kyc:review'], <KycCase />)} />
          <Route path="alerts" element={gated(['compliance:cases:manage'], <Alerts />)} />
          <Route path="cases" element={gated(['compliance:cases:manage'], <Cases />)} />
          <Route path="cases/:caseId" element={gated(['compliance:cases:manage'], <CaseDetail />)} />
          <Route path="enforcement" element={gated(['compliance:cases:manage', 'compliance:blacklist:manage'], <Enforcement />)} />
          <Route path="screening" element={gated(['compliance:cases:manage'], <Screening />)} />

          <Route path="reconciliation" element={gated(['reserves:read'], <Reconciliation />)} />
          <Route path="custodians" element={gated(['reserves:read'], <Custodians />)} />
          <Route path="attestations" element={gated(['reserves:read'], <Attestations />)} />
          <Route path="exposure" element={gated(['reserves:read'], <Exposure />)} />
          <Route path="pricing" element={gated(['reserves:read'], <PricingPairs />)} />
          <Route path="ledger" element={gated(['ledger:read'], <Ledger />)} />

          <Route path="audit" element={gated(['audit:read'], <Audit />)} />
          <Route path="reports" element={gated(['reports:read'], <Reports />)} />
          <Route path="directory" element={gated(['admin:users:manage'], <Directory />)} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

export function App() {
  return (
    <AppRoot>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/*" element={<ConsoleEntry />} />
      </Routes>
    </AppRoot>
  );
}
