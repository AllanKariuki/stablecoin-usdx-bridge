import { useState, type FormEvent } from 'react';
import { Repeat } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { fetchWalletStatement, fetchWallets, selectMoneyMovement, transferBetweenWallets } from '../../redux/slices/wallet/walletSlice';
import type { DampWallet } from '../../types/wallet/dampWallet';

interface TransferFormProps {
  wallets: DampWallet[];
}

/**
 * Internal transfer between two of the caller's own wallets, via bff's
 * POST /transfers -> core-ledger. Same-currency only in this UI — core-ledger
 * itself is the source of truth for whether a transfer is legal (P1 doesn't
 * add client-side FX; that's the existing /fx/conversions flow, out of
 * scope here).
 */
export default function TransferForm({ wallets }: TransferFormProps) {
  const dispatch = useAppDispatch();
  const { submitting, error } = useAppSelector(selectMoneyMovement);
  const [fromWalletId, setFromWalletId] = useState(wallets[0]?.id ?? '');
  const [toWalletId, setToWalletId] = useState(wallets[1]?.id ?? wallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSuccess(false);
    if (!fromWalletId || !toWalletId || fromWalletId === toWalletId || !amount) return;
    const result = await dispatch(transferBetweenWallets({ fromWalletId, toWalletId, amount, reference }));
    if (transferBetweenWallets.fulfilled.match(result)) {
      setSuccess(true);
      setAmount('');
      setReference('');
      dispatch(fetchWallets());
      dispatch(fetchWalletStatement({ walletId: fromWalletId }));
      dispatch(fetchWalletStatement({ walletId: toWalletId }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
          <Repeat className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-gray-800">Transfer</h2>
          <p className="text-sm text-gray-500">Move funds between your wallets</p>
        </div>
      </div>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="transfer-from">
        From
      </label>
      <select
        id="transfer-from"
        value={fromWalletId}
        onChange={(e) => setFromWalletId(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} — {w.currency} ({w.balance.display})
          </option>
        ))}
      </select>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="transfer-to">
        To
      </label>
      <select
        id="transfer-to"
        value={toWalletId}
        onChange={(e) => setToWalletId(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {wallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} — {w.currency} ({w.balance.display})
          </option>
        ))}
      </select>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="transfer-amount">
        Amount
      </label>
      <input
        id="transfer-amount"
        type="text"
        inputMode="decimal"
        placeholder="100.00"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="transfer-reference">
        Reference (optional)
      </label>
      <input
        id="transfer-reference"
        type="text"
        value={reference}
        onChange={(e) => setReference(e.target.value)}
        className="w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {fromWalletId && fromWalletId === toWalletId && (
        <p className="text-sm text-amber-600 mb-3">Choose two different wallets.</p>
      )}
      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
      {success && <p className="text-sm text-green-600 mb-3">Transfer posted.</p>}

      <button
        type="submit"
        disabled={submitting || !fromWalletId || !toWalletId || fromWalletId === toWalletId || !amount}
        className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Posting…' : 'Transfer'}
      </button>
    </form>
  );
}
