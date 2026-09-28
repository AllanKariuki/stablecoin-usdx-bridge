import React from 'react';
import { Plus, ShieldCheck, Clock, Trash2, AlertTriangle } from 'lucide-react';
import type { BankAccount } from '../../types/bankAccounts';

interface BankAccountsListProps {
  accounts: BankAccount[];
  loading: boolean;
  error: string | null;
  onAddBankAccount: () => void;
  onVerifyAccount: (id: string) => void;
  onRemoveAccount: (id: string) => void;
}

/**
 * A customer's bank accounts.
 *
 * This replaces a two-section list ("my accounts" and "linked accounts") that
 * showed the same rows twice under different names, a reveal-the-account-
 * number toggle, and a "KES {balance}" figure — none of which survive contact
 * with the real backend:
 *
 *  - There is one list. Registered and verified are *statuses* of one account,
 *    not two kinds of object, and treating them as two made an account appear
 *    twice the moment it was verified.
 *  - The account number cannot be revealed because it is not stored. Only the
 *    last four digits ever reach this platform.
 *  - A bank account's balance is the bank's to know. The balance this platform
 *    knows about is a wallet balance, and it lives on the wallet screen.
 */
const BankAccountsList: React.FC<BankAccountsListProps> = ({
  accounts,
  loading,
  error,
  onAddBankAccount,
  onVerifyAccount,
  onRemoveAccount,
}) => {
  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Bank Accounts</h1>
          <p className="text-gray-600 mt-1">
            Accounts you can deposit from. Withdrawals need a verified account.
          </p>
        </div>
        <button
          onClick={onAddBankAccount}
          className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Bank Account
        </button>
      </div>

      {loading && (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          <p className="text-gray-600 mt-2">Loading accounts…</p>
        </div>
      )}

      {/* A real error, shown as one. The slice no longer falls back to mock
          data, so an empty list after an error means the request failed —
          not that the customer has no accounts. */}
      {error && !loading && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 text-sm font-medium">Couldn’t load your accounts</p>
            <p className="text-red-700 text-sm mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {!loading && !error && accounts.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">🏦</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">No bank accounts yet</h2>
          <p className="text-gray-600 mb-6">Add one to deposit funds or withdraw to your bank.</p>
          <button
            onClick={onAddBankAccount}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add your first account
          </button>
        </div>
      )}

      {!loading && accounts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {accounts.map((account) => (
            <div
              key={account.id}
              className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
            >
              <div className="bg-gradient-to-r from-slate-50 to-slate-100 p-4 flex items-start justify-between">
                <div>
                  <h3 className="font-semibold text-gray-900">{account.bankName}</h3>
                  <p className="text-xs text-gray-600 mt-1">{account.currency}</p>
                </div>
                <StatusBadge status={account.status} />
              </div>

              <div className="p-4 space-y-3">
                <Field label="Account holder" value={account.accountName} />
                <div>
                  <p className="text-xs text-gray-600">Account number</p>
                  <p className="font-mono text-sm text-gray-700">{account.accountNumberMasked}</p>
                  <p className="text-[11px] text-gray-400 mt-1">
                    Only the last four digits are stored.
                  </p>
                </div>
                {account.verifiedAt && (
                  <p className="text-xs text-gray-500">
                    Verified {new Date(account.verifiedAt).toLocaleDateString()}
                  </p>
                )}
              </div>

              <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex gap-2">
                {account.status === 'PENDING' && (
                  <button
                    onClick={() => onVerifyAccount(account.id)}
                    className="flex-1 px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Verify account
                  </button>
                )}
                <button
                  onClick={() => onRemoveAccount(account.id)}
                  className="px-3 py-2 border border-gray-300 text-gray-700 text-xs font-medium rounded-lg hover:bg-gray-100 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const Field: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div>
    <p className="text-xs text-gray-600">{label}</p>
    <p className="font-medium text-gray-900">{value}</p>
  </div>
);

const StatusBadge: React.FC<{ status: BankAccount['status'] }> = ({ status }) => {
  if (status === 'VERIFIED') {
    return (
      <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full flex items-center gap-1">
        <ShieldCheck className="w-3 h-3" />
        Verified
      </span>
    );
  }
  if (status === 'PENDING') {
    return (
      <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-medium rounded-full flex items-center gap-1">
        <Clock className="w-3 h-3" />
        Pending
      </span>
    );
  }
  return (
    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs font-medium rounded-full">
      {status.charAt(0) + status.slice(1).toLowerCase()}
    </span>
  );
};

export default BankAccountsList;
