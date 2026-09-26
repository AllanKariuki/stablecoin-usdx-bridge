import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDownRight, ArrowLeftRight, ArrowUpRight, Wallet as WalletIcon } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../redux/hooks';
import {
  fetchDashboard,
  selectDashboardError,
  selectDashboardLoading,
  selectDashboardRecentTransactions,
  selectDashboardWallets,
} from '../redux/slices/dashboard/dashboardSlice';
import { primaryEntryFor } from '../types/transactions/dampTransaction';

const DIRECTION_ICON = {
  CREDIT: <ArrowDownRight className="w-5 h-5 text-green-600" />,
  DEBIT: <ArrowUpRight className="w-5 h-5 text-red-600" />,
};

/**
 * Real data only: wallets + balances and the recent cross-wallet
 * transaction feed from bff's GET /dashboard (docs/building-plan.md's P1
 * DoD — "land on the dashboard, see your wallets and your real balances").
 * The previous version of this page rendered fabricated KPIs, a spend
 * category donut, a crypto market ticker and vendor/bill widgets with no
 * backing service — removed rather than wired to fake data.
 */
const Dashboard = () => {
  const dispatch = useAppDispatch();
  const wallets = useAppSelector(selectDashboardWallets);
  const recentTransactions = useAppSelector(selectDashboardRecentTransactions);
  const loading = useAppSelector(selectDashboardLoading);
  const error = useAppSelector(selectDashboardError);

  useEffect(() => {
    dispatch(fetchDashboard());
  }, [dispatch]);

  const ownWalletIds = new Set(wallets.map((w) => w.id));

  return (
    <div className="min-h-screen">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
        <p className="text-gray-500 mt-1">Your wallets and recent activity</p>
      </div>

      {error && (
        <div className="mb-6 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading && wallets.length === 0 && <div className="text-gray-500">Loading…</div>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {wallets.map((wallet) => (
          <Link
            key={wallet.id}
            to="/wallet/overview"
            className="bg-white rounded-xl p-6 border border-gray-200 hover:border-blue-400 transition-colors"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-800">{wallet.label}</h3>
              <WalletIcon className="w-6 h-6 text-gray-400" />
            </div>
            <p className="text-3xl font-bold text-gray-900 mb-2">{wallet.balance.display}</p>
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>{wallet.chain}</span>
              <span className="uppercase text-xs font-medium">{wallet.status}</span>
            </div>
          </Link>
        ))}
        {!loading && wallets.length === 0 && !error && (
          <div className="col-span-full text-gray-500 text-sm">No wallets yet.</div>
        )}
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Link
          to="/wallet/overview"
          className="px-4 py-2 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 flex items-center gap-2"
        >
          <ArrowDownRight className="w-4 h-4" /> Deposit
        </Link>
        <Link
          to="/wallet/overview"
          className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 flex items-center gap-2"
        >
          <ArrowLeftRight className="w-4 h-4" /> Transfer
        </Link>
      </div>

      <div className="bg-white rounded-xl p-6 border border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-800">Recent Transactions</h2>
          <Link to="/wallet/transactions" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View all
          </Link>
        </div>

        {recentTransactions.length === 0 && !loading && (
          <p className="text-sm text-gray-500">No transactions yet.</p>
        )}

        <div className="space-y-1">
          {recentTransactions.map((tx) => {
            const entry = primaryEntryFor(tx, ownWalletIds);
            return (
              <div key={tx.id} className="grid grid-cols-4 gap-4 py-4 border-b border-gray-100 last:border-b-0 items-center">
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      entry.direction === 'CREDIT' ? 'bg-green-100' : 'bg-red-100'
                    }`}
                  >
                    {DIRECTION_ICON[entry.direction as 'CREDIT' | 'DEBIT'] ?? entry.direction}
                  </div>
                  <div>
                    <p className="font-medium text-gray-800">{tx.description || tx.type}</p>
                    <p className="text-xs text-gray-500">{tx.type}</p>
                  </div>
                </div>
                <div className="text-sm text-gray-600">{new Date(tx.valueDate).toLocaleString()}</div>
                <div className={`font-semibold ${entry.direction === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.amount.display}
                </div>
                <div className="text-right">
                  <span className="px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 uppercase">
                    {tx.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
