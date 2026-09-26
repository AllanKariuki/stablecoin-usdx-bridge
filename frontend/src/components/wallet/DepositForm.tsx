import { useState, type FormEvent } from 'react';
import { Download } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { depositToWallet, fetchWalletStatement, fetchWallets, selectMoneyMovement } from '../../redux/slices/wallet/walletSlice';
import type { DampWallet } from '../../types/wallet/dampWallet';

interface DepositFormProps {
  wallets: DampWallet[];
  defaultWalletId?: string | null;
}

/**
 * Deposits post directly to core-ledger via bff's POST /deposits — this is
 * P1's real money-movement path (docs/building-plan.md's DoD: "Make a
 * deposit ... from the UI and watch the statement line appear"), not the
 * multi-step bank-rail wizard in pages/transactions/DepositsCreate.tsx,
 * which targets P4's external payment rails and never calls an API today.
 */
export default function DepositForm({ wallets, defaultWalletId }: DepositFormProps) {
  const dispatch = useAppDispatch();
  const { submitting, error } = useAppSelector(selectMoneyMovement);
  const [walletId, setWalletId] = useState(defaultWalletId ?? wallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    if (!walletId || !amount) return;
    const result = await dispatch(depositToWallet({ walletId, amount, reference }));
    if (depositToWallet.fulfilled.match(result)) {
      setSuccess(true);
      setAmount('');
      setReference('');
      dispatch(fetchWallets());
      dispatch(fetchWalletStatement({ walletId }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
          <Download className="w-5 h-5 text-green-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">Deposit</h2>
          <p className="text-sm text-gray-500">Credit one of your wallets</p>
        </div>
      </div>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="deposit-wallet">
        Wallet
      </label>
      <select
        id="deposit-wallet"
        value={walletId}
        onChange={(e) => setWalletId(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} — {w.currency} ({w.balance.display})
          </option>
        ))}
      </select>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="deposit-amount">
        Amount
      </label>
      <input
        id="deposit-amount"
        type="text"
        inputMode="decimal"
        placeholder="250.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="deposit-reference">
        Reference (optional)
      </label>
      <input
        id="deposit-reference"
        type="text"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {success && <p className="text-sm text-green-600 mb-3">Deposit posted.</p>}

      <button
        type="submit"
        disabled={submitting || !walletId || !amount}
        className="w-full px-4 py-3 bg-green-600 text-white rounded-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting…' : 'Deposit'}
      </button>
    </form>
  );
}
