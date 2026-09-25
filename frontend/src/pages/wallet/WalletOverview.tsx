import { useEffect } from 'react';
import { Download, Upload } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import BalanceCard from '../../components/dashboard/BalanceCard';
import DepositForm from '../../components/wallet/DepositForm';
import TransferForm from '../../components/wallet/TransferForm';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import {
  fetchWalletStatement,
  fetchWallets,
  selectSelectedWallet,
  selectWalletError,
  selectWalletLoading,
  selectWallets,
  selectWalletStatement,
  selectWallet,
} from '../../redux/slices/wallet/walletSlice';

const CARD_COLORS = [
  'bg-gradient-to-br from-green-400 to-green-600',
  'bg-gradient-to-br from-blue-400 to-blue-600',
  'bg-gradient-to-br from-purple-500 to-purple-700',
  'bg-gradient-to-br from-orange-400 to-orange-600',
];

const WalletOverview = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const wallets = useAppSelector(selectWallets);
  const selectedWallet = useAppSelector(selectSelectedWallet);
  const loading = useAppSelector(selectWalletLoading);
  const error = useAppSelector(selectWalletError);
  const selectedWalletId = selectedWallet?.id ?? '';
  const statement = useAppSelector(selectWalletStatement(selectedWalletId));

  useEffect(() => {
    dispatch(fetchWallets());
  }, [dispatch]);

  useEffect(() => {
    if (selectedWalletId) {
      dispatch(fetchWalletStatement({ walletId: selectedWalletId, limit: 20 }));
    }
  }, [dispatch, selectedWalletId]);

  return (
    <div className="bg-gray-50">
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-3">
        <button className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors" onClick={() => navigate('/dashboard')}>
          Home
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">Wallets</span>
      </div>

      <div className="mb-6 px-6">
        <h1 className="text-3xl font-bold text-gray-800">Wallets</h1>
      </div>

      {error && (
        <div className="mx-6 mb-4 px-4 py-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      {loading && wallets.length === 0 && <div className="px-6 text-gray-500">Loading wallets…</div>}

      {!loading && wallets.length === 0 && !error && (
        <div className="mx-6 px-4 py-3 bg-gray-100 border border-gray-200 text-gray-600 rounded-lg text-sm">
          No wallets found for your account.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 mb-6 px-6">
        <div className="lg:col-span-4 space-y-4">
          {wallets.map((wallet, index) => (
            <button key={wallet.id} onClick={() => dispatch(selectWallet(wallet.id))} className="block w-full text-left">
              <BalanceCard
                title={wallet.label}
                amount={wallet.balance.display}
                info1={{ label: 'Chain', value: wallet.chain }}
                info2={{ label: 'Status', value: wallet.status }}
                name={wallet.address || wallet.id}
                color={CARD_COLORS[index % CARD_COLORS.length]}
              />
            </button>
          ))}
        </div>

        <div className="lg:col-span-6 space-y-6">
          <DepositForm wallets={wallets} defaultWalletId={selectedWallet?.id} />
          {wallets.length > 1 && <TransferForm wallets={wallets} />}
        </div>
      </div>

      <div className="px-6 pb-6">
        <div className="bg-white rounded-xl p-6 border border-gray-200">
          <div className="mb-4">
            <h2 className="text-lg font-bold text-gray-800">
              {selectedWallet ? `${selectedWallet.label} — Statement` : 'Wallet Activity'}
            </h2>
            <p className="text-sm text-gray-500">Every posted entry against this wallet's account, most recent first.</p>
          </div>
          {!selectedWallet && <p className="text-sm text-gray-500">Select a wallet to see its statement.</p>}
          {selectedWallet && !statement && <p className="text-sm text-gray-500">Loading statement…</p>}
          {selectedWallet && statement && statement.entries.length === 0 && (
            <p className="text-sm text-gray-500">No transactions yet.</p>
          )}
          <div className="space-y-1">
            {statement?.entries.map((entry) => (
              <div
                key={entry.seq}
                className="grid grid-cols-5 gap-4 py-4 border-b border-gray-100 last:border-b-0 items-center"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      entry.direction === 'CREDIT' ? 'bg-green-100' : 'bg-red-100'
                    }`}
                  >
                    {entry.direction === 'CREDIT' ? (
                      <Download className="w-5 h-5 text-green-600" />
                    ) : (
                      <Upload className="w-5 h-5 text-red-600" />
                    )}
                  </div>
                  <span className="font-medium text-gray-800">{entry.description || entry.transactionId}</span>
                </div>
                <div className="text-sm text-gray-600">{new Date(entry.valueDate).toLocaleString()}</div>
                <div className={`font-semibold ${entry.direction === 'CREDIT' ? 'text-green-600' : 'text-red-600'}`}>
                  {entry.amount.display}
                </div>
                <div className="text-sm text-gray-600">{entry.runningBalance.display}</div>
                <div className="text-right text-xs text-gray-400">#{entry.seq}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WalletOverview;
