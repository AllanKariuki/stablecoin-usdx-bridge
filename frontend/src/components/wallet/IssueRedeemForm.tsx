import { useEffect, useState, type FormEvent } from 'react';
import { Coins } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { fetchWalletStatement, fetchWallets } from '../../redux/slices/wallet/walletSlice';
import {
  clearActiveTransfer,
  fetchTransfer,
  issueUsdx,
  openUsdxWallet,
  redeemUsdx,
  selectActiveTransfer,
  selectIssuance,
} from '../../redux/slices/issuance/issuanceSlice';
import type { DampWallet } from '../../types/wallet/dampWallet';
import SagaProgress from './SagaProgress';

/** Sepolia finality is ~15 minutes; polling faster than this buys nothing. */
export const POLL_INTERVAL_MS = 5000;

type Mode = 'issue' | 'redeem';

interface IssueRedeemFormProps {
  wallets: DampWallet[];
}

/**
 * P2's browser half (docs/building-plan.md's P2 DoD): turn a USD balance into
 * USD-X on chain and back, then follow the saga until it is final, with the
 * mint/burn hash linked to the explorer.
 */
export default function IssueRedeemForm({ wallets }: IssueRedeemFormProps) {
  const dispatch = useAppDispatch();
  const { submitting, error, activeCorrelationId } = useAppSelector(selectIssuance);
  const transfer = useAppSelector(selectActiveTransfer);

  const fiatWallets = wallets.filter((w) => w.currency === 'USD');
  const usdxWallets = wallets.filter((w) => w.currency === 'USDX');

  const [mode, setMode] = useState<Mode>('issue');
  const [fiatWalletId, setFiatWalletId] = useState(fiatWallets[0]?.id ?? '');
  const [usdxWalletId, setUsdxWalletId] = useState(usdxWallets[0]?.id ?? '');
  const [amount, setAmount] = useState('');
  const [chain, setChain] = useState('ETHEREUM');
  const [address, setAddress] = useState('');

  // Wallets arrive asynchronously; adopt the first of each once they do.
  useEffect(() => {
    if (!fiatWalletId && fiatWallets[0]) setFiatWalletId(fiatWallets[0].id);
    if (!usdxWalletId && usdxWallets[0]) setUsdxWalletId(usdxWallets[0].id);
  }, [fiatWallets, usdxWallets, fiatWalletId, usdxWalletId]);

  // Poll the active saga until it reaches a terminal state, then refresh the
  // balances it moved.
  const terminal = transfer?.terminal ?? false;
  useEffect(() => {
    if (!activeCorrelationId || terminal) return;
    dispatch(fetchTransfer(activeCorrelationId));
    const timer = setInterval(() => dispatch(fetchTransfer(activeCorrelationId)), POLL_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [activeCorrelationId, terminal, dispatch]);

  useEffect(() => {
    if (!terminal) return;
    dispatch(fetchWallets());
    if (fiatWalletId) dispatch(fetchWalletStatement({ walletId: fiatWalletId }));
    if (usdxWalletId) dispatch(fetchWalletStatement({ walletId: usdxWalletId }));
    // Only on the transition to terminal, not on every wallet selection change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminal, dispatch]);

  const handleOpenWallet = async (e: FormEvent) => {
    e.preventDefault();
    const result = await dispatch(openUsdxWallet({ chain, address: chain === 'SOLANA' ? undefined : address }));
    if (openUsdxWallet.fulfilled.match(result)) {
      setUsdxWalletId(result.payload.id);
      dispatch(fetchWallets());
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!fiatWalletId || !usdxWalletId || !amount) return;
    dispatch(clearActiveTransfer());
    const thunk = mode === 'issue' ? issueUsdx : redeemUsdx;
    const result = await dispatch(thunk({ fiatWalletId, usdxWalletId, amount }));
    if (thunk.fulfilled.match(result)) {
      setAmount('');
      // The journal entry is already posted; show it moving the balance now.
      dispatch(fetchWallets());
    }
  };

  const header = (
    <div className="flex items-center gap-3 mb-4">
      <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
        <Coins className="w-5 h-5 text-indigo-600" />
      </div>
      <div>
        <h2 className="text-lg font-bold text-gray-800">USD-X</h2>
        <p className="text-sm text-gray-500">Issue USD-X on chain from your USD balance, or redeem it back</p>
      </div>
    </div>
  );

  const inputClass =
    'w-full px-4 py-2 mb-4 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500';

  if (usdxWallets.length === 0) {
    return (
      <form onSubmit={handleOpenWallet} className="bg-white rounded-xl p-6 border border-gray-200">
        {header}
        <p className="text-sm text-gray-600 mb-4">You need a USD-X wallet before you can issue.</p>
        <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="usdx-chain">
          Chain
        </label>
        <select id="usdx-chain" value={chain} onChange={(e) => setChain(e.target.value)} className={inputClass}>
          <option value="ETHEREUM">Ethereum (Sepolia)</option>
          <option value="SOLANA">Solana (devnet)</option>
        </select>
        {chain === 'ETHEREUM' ? (
          <>
            <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="usdx-address">
              Your Ethereum address
            </label>
            <input
              id="usdx-address"
              type="text"
              placeholder="0x…"
              value={address}
              onChange={(e) => setAddress(e.target.value.trim())}
              className={`${inputClass} font-mono`}
            />
          </>
        ) : (
          <p className="text-xs text-gray-500 mb-4">
            Solana USD-X is held in a platform-custodied account; your balance is tracked in the ledger.
          </p>
        )}
        {error && <p className="text-sm text-red-600 mb-3">{error}</p>}
        <button
          type="submit"
          disabled={submitting || (chain === 'ETHEREUM' && !address)}
          className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {submitting ? 'Opening…' : 'Open USD-X wallet'}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl p-6 border border-gray-200">
      {header}

      <div className="flex gap-2 mb-4" role="tablist">
        {(['issue', 'redeem'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium ${
              mode === m ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {m === 'issue' ? 'Issue' : 'Redeem'}
          </button>
        ))}
      </div>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="issue-fiat-wallet">
        {mode === 'issue' ? 'Pay from' : 'Release USD to'}
      </label>
      <select id="issue-fiat-wallet" value={fiatWalletId} onChange={(e) => setFiatWalletId(e.target.value)} className={inputClass}>
        {fiatWallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} — {w.balance.display}
          </option>
        ))}
      </select>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="issue-usdx-wallet">
        {mode === 'issue' ? 'Mint to' : 'Burn from'}
      </label>
      <select id="issue-usdx-wallet" value={usdxWalletId} onChange={(e) => setUsdxWalletId(e.target.value)} className={inputClass}>
        {usdxWallets.map((w) => (
          <option key={w.id} value={w.id}>
            {w.label} ({w.chain}) — {w.balance.display}
          </option>
        ))}
      </select>

      <label className="text-sm font-medium text-gray-700 mb-1 block" htmlFor="issue-amount">
        Amount
      </label>
      <input
        id="issue-amount"
        type="text"
        inputMode="decimal"
        placeholder={mode === 'issue' ? '250.00' : '100.00'}
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        className={inputClass}
      />

      {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

      <button
        type="submit"
        disabled={submitting || !fiatWalletId || !usdxWalletId || !amount}
        className="w-full px-4 py-3 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {submitting ? 'Submitting…' : mode === 'issue' ? 'Issue USD-X' : 'Redeem USD-X'}
      </button>

      {activeCorrelationId && !transfer && <p className="text-sm text-gray-500 mt-4">Accepted — waiting for the saga…</p>}
      {transfer && <SagaProgress transfer={transfer} />}
    </form>
  );
}
