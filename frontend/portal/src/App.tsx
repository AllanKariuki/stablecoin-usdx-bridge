import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthCallback, RequireAuth, RequirePermission, RequireRole, useAuth } from '@damp/web-shared/auth';
import { NotFoundPage } from '@damp/web-shared/pages';
import { FullPageLoader } from '@damp/web-shared/ui';
import PortalLayout from './components/PortalLayout';
import Landing from './pages/Landing';
import HomePage from './pages/HomePage';
import WalletsPage from './pages/WalletsPage';
import WalletDetailPage from './pages/WalletDetailPage';
import ConvertPage from './pages/ConvertPage';
import MoveMoneyPage from './pages/MoveMoneyPage';
import UsdxPage from './pages/UsdxPage';
import TransactionsPage from './pages/TransactionsPage';
import PaymentsPage from './pages/PaymentsPage';
import SendMoneyPage from './pages/SendMoneyPage';
import PayInvoicePage from './pages/PayInvoicePage';
import VerificationPage from './pages/VerificationPage';
import NotificationsPage from './pages/NotificationsPage';
import ApprovalsPage from './pages/ApprovalsPage';
import SettingsPage from './pages/SettingsPage';

/** Staff who sign in here are pointed at the Ops Console instead. */
const OPS_CONSOLE = { label: 'Open the Ops Console', href: 'http://localhost:5174' };

function PublicHome() {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageLoader label="Checking your session" />;
  return status === 'authenticated' ? <Navigate to="/home" replace /> : <Landing />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<PublicHome />} />
      <Route path="/auth/callback" element={<AuthCallback />} />
      {/* services/payments links invoice payers here; it must open without an account. */}
      <Route path="/pay/:payToken" element={<PayInvoicePage />} />

      <Route
        element={
          <RequireAuth>
            <RequireRole roles={['customer', 'company']} elsewhere={OPS_CONSOLE}>
              <PortalLayout />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route path="/home" element={<HomePage />} />
        <Route path="/wallets" element={<RequirePermission anyOf={['wallets:read:own']}><WalletsPage /></RequirePermission>} />
        <Route path="/wallets/:walletId" element={<RequirePermission anyOf={['wallets:read:own']}><WalletDetailPage /></RequirePermission>} />
        <Route path="/convert" element={<RequirePermission anyOf={['fx:convert']}><ConvertPage /></RequirePermission>} />
        <Route path="/move" element={<Navigate to="/move/deposit" replace />} />
        <Route path="/move/:kind" element={<RequirePermission anyOf={['wallets:write:own']}><MoveMoneyPage /></RequirePermission>} />
        <Route path="/usdx" element={<RequirePermission anyOf={['issuance:create', 'redemption:create']}><UsdxPage /></RequirePermission>} />
        <Route path="/transactions" element={<RequirePermission anyOf={['transactions:read:own']}><TransactionsPage /></RequirePermission>} />
        <Route path="/payments/*" element={<RequirePermission anyOf={['payments:read:own']}><PaymentsPage /></RequirePermission>} />
        <Route path="/send" element={<RequirePermission anyOf={['payments:write:own']}><SendMoneyPage /></RequirePermission>} />
        <Route path="/verification" element={<RequirePermission anyOf={['kyc:submit']}><VerificationPage /></RequirePermission>} />
        <Route path="/notifications" element={<RequirePermission anyOf={['notifications:read:own']}><NotificationsPage /></RequirePermission>} />
        <Route path="/approvals" element={<RequirePermission anyOf={['approvals:propose', 'approvals:decide']}><ApprovalsPage /></RequirePermission>} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
