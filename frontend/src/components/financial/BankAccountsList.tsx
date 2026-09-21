import React, { useState } from 'react';
import { Plus, Eye, EyeOff, Unlink } from 'lucide-react';
import type { UserBankAccount, LinkedAccount } from '../../types/bankAccounts';

interface BankAccountsListProps {
  userBankAccounts: UserBankAccount[];
  linkedAccounts: LinkedAccount[];
  loading: boolean;
  error: string | null;
  onAddBankAccount: () => void;
  onLinkAccount: () => void;
  onUnlinkAccount: (id: string) => void;
}

const BankAccountsList: React.FC<BankAccountsListProps> = ({
  userBankAccounts,
  linkedAccounts,
  loading,
  error,
  onAddBankAccount,
  onLinkAccount,
  onUnlinkAccount,
}) => {
  const [showAccountNumbers, setShowAccountNumbers] = useState<Set<string>>(new Set());

  const toggleAccountVisibility = (id: string) => {
    const newSet = new Set(showAccountNumbers);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setShowAccountNumbers(newSet);
  };

  const maskAccountNumber = (accountNumber: string) => {
    const last4 = accountNumber.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">My Bank Accounts</h1>
          <p className="text-gray-600 mt-1">Manage your bank accounts and perform transactions</p>
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
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="text-gray-600 mt-2">Loading accounts...</p>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p className="text-red-800 text-sm">{error}</p>
        </div>
      )}
      
      {!loading && userBankAccounts.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
          <div className="text-5xl mb-4">🏦</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">No Bank Accounts</h2>
          <p className="text-gray-600">Add your bank accounts to start managing transactions</p>
        </div>
      ) : (
        !loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {userBankAccounts.map((account) => (
              <div key={account.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden">
                <div className="bg-gradient-to-r from-green-50 to-green-100 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-semibold text-gray-900">{account.bankName}</h3>
                      <p className="text-xs text-gray-600 mt-1">{account.type}</p>
                    </div>
                    <div className="flex gap-1">
                      {account.isVerified && (
                        <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                          ✓ Verified
                        </span>
                      )}
                      {account.connectionType === 'linked' && (
                        <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-medium rounded-full">
                          🔗 Linked
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="p-4 space-y-3">
                  <div>
                    <p className="text-xs text-gray-600">Account Holder</p>
                    <p className="font-medium text-gray-900">{account.accountHolder}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600">Account Number</p>
                    <p className="font-mono text-sm text-gray-700">{account.accountNumber}</p>
                  </div>
                  {account.balance !== undefined && (
                    <div className="pt-3 border-t border-gray-200">
                      <p className="text-xs text-gray-600">Available Balance</p>
                      <p className="text-2xl font-bold text-gray-900">KES {account.balance.toLocaleString()}</p>
                    </div>
                  )}
                  {account.lastVerified && (
                    <div className="text-xs text-gray-500">
                      Last verified: {new Date(account.lastVerified).toLocaleDateString()}
                    </div>
                  )}
                </div>
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 grid grid-cols-3 gap-2">
                  <button className="px-3 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
                    Withdraw
                  </button>
                  <button className="px-3 py-2 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors">
                    Top Up
                  </button>
                  <button className="px-3 py-2 bg-purple-600 text-white text-xs font-medium rounded-lg hover:bg-purple-700 transition-colors">
                    Transfer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* Linked Accounts Section */}
      <div className="mt-12">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Linked Accounts</h2>
            <p className="text-gray-600 text-sm mt-1">Bank accounts linked via API or open banking</p>
          </div>
          <button
            onClick={onLinkAccount}
            className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Link New Account
          </button>
        </div>

        {linkedAccounts.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4">🔗</div>
            <h3 className="text-xl font-semibold text-gray-800 mb-2">No Linked Accounts</h3>
            <p className="text-gray-600 mb-6">Link your bank accounts to enable quick transfers and payments</p>
            <button
              onClick={onLinkAccount}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Link Your First Account
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {linkedAccounts.map((account) => (
              <div key={account.id} className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden">
                <div className="bg-gradient-to-r from-indigo-50 to-indigo-100 p-4 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-gray-900">{account.bankName}</h3>
                    <p className="text-xs text-gray-600 mt-1">{account.accountType}</p>
                  </div>
                  {account.isVerified && (
                    <span className="bg-green-100 text-green-700 text-xs font-medium px-2 py-1 rounded-full">
                      Verified
                    </span>
                  )}
                </div>
                <div className="p-4 space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-sm text-gray-600">Account Number</p>
                      <button
                        onClick={() => toggleAccountVisibility(account.id)}
                        className="p-1 hover:bg-gray-100 rounded transition-colors"
                      >
                        {showAccountNumbers.has(account.id) ? (
                          <Eye className="w-4 h-4 text-gray-600" />
                        ) : (
                          <EyeOff className="w-4 h-4 text-gray-600" />
                        )}
                      </button>
                    </div>
                    <p className="font-mono text-sm text-gray-700">
                      {showAccountNumbers.has(account.id)
                        ? account.accountNumber
                        : maskAccountNumber(account.accountNumber)}
                    </p>
                  </div>
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600 mb-1">Linked Date</p>
                    <p className="text-sm text-gray-800">
                      {new Date(account.linkedDate).toLocaleDateString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Last Verified</p>
                    <p className="text-sm text-gray-800">
                      {new Date(account.lastVerified).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 space-y-2">
                  <div className="grid grid-cols-2 gap-2 mb-2">
                    <button className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors">
                      Send Money
                    </button>
                    <button className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors">
                      Request Money
                    </button>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Unlink ${account.bankName}?`)) {
                        onUnlinkAccount(account.id);
                      }
                    }}
                    className="w-full px-4 py-2 text-red-600 text-sm font-medium rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-2"
                  >
                    <Unlink className="w-4 h-4" />
                    Unlink Account
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default BankAccountsList;
