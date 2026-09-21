import React, { useState } from 'react';
import { Plus, Unlink, Eye, EyeOff } from 'lucide-react';

export interface LinkedAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountType: string;
  linkedDate: string;
  lastVerified: string;
  isVerified: boolean;
}

interface LinkedBankAccountsProps {
  accounts: LinkedAccount[];
  onLinkNewAccount?: () => void;
  onUnlinkAccount: (id: string) => void;
  onMakeTransaction?: (account: LinkedAccount) => void;
}

const LinkedBankAccounts: React.FC<LinkedBankAccountsProps> = ({
  accounts,
  onLinkNewAccount,
  onUnlinkAccount,
  onMakeTransaction,
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Linked Bank Accounts</h1>
              <p className="text-gray-600 mt-1">Manage your linked bank accounts for transfers</p>
            </div>
            {onLinkNewAccount && (
              <button
                onClick={onLinkNewAccount}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Link New Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {accounts.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4">🔗</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              No Linked Accounts
            </h2>
            <p className="text-gray-600 mb-6">
              Link your bank accounts to enable quick transfers and payments
            </p>
            {onLinkNewAccount && (
              <button
                onClick={onLinkNewAccount}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Link Your First Account
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
              >
                {/* Card Header */}
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

                {/* Card Body */}
                <div className="p-4 space-y-4">
                  {/* Account Number */}
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

                  {/* Linked Date */}
                  <div className="pt-2 border-t border-gray-200">
                    <p className="text-xs text-gray-600 mb-1">Linked Date</p>
                    <p className="text-sm text-gray-800">
                      {new Date(account.linkedDate).toLocaleDateString()}
                    </p>
                  </div>

                  {/* Last Verified */}
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Last Verified</p>
                    <p className="text-sm text-gray-800">
                      {new Date(account.lastVerified).toLocaleDateString()}
                    </p>
                  </div>
                </div>

                {/* Card Footer */}
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 space-y-2">
                  {/* Transaction Actions */}
                  {onMakeTransaction && (
                    <div className="grid grid-cols-2 gap-2 mb-2">
                      <button
                        onClick={() => onMakeTransaction(account)}
                        className="px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                      >
                        Send Money
                      </button>
                      <button
                        onClick={() => console.log('Receive money to:', account)}
                        className="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
                      >
                        Request Money
                      </button>
                    </div>
                  )}
                  
                  {/* Unlink Button */}
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

export default LinkedBankAccounts;
