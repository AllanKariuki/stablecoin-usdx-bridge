import React, { useState } from 'react';
import { Plus, Trash2, MoreVertical, Bookmark, Copy } from 'lucide-react';

export interface MobileMoneyAccount {
  id: string;
  provider: string;
  phoneNumber: string;
  displayName: string;
  balance?: number;
  lastTransaction?: {
    amount: number;
    date: string;
    type: 'sent' | 'received';
  };
  isDefault?: boolean;
}

interface MobileMoneyAccountsProps {
  accounts: MobileMoneyAccount[];
  onAddAccount?: () => void;
  onDeleteAccount: (id: string) => void;
  onSetDefault: (id: string) => void;
  onSendMoney?: (account: MobileMoneyAccount) => void;
}

const MobileMoneyAccounts: React.FC<MobileMoneyAccountsProps> = ({
  accounts,
  onAddAccount,
  onDeleteAccount,
  onSetDefault,
  onSendMoney,
}) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPhoneNumber = (phoneNumber: string) => {
    navigator.clipboard.writeText(phoneNumber);
    setCopiedId(phoneNumber);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getProviderIcon = (provider: string) => {
    const icons: Record<string, string> = {
      'M-Pesa': '📱',
      'Airtel Money': '📲',
      'Equitel': '📞',
      'Orange Money': '🟠',
    };
    return icons[provider] || '💰';
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">Mobile Money Accounts</h1>
              <p className="text-gray-600 mt-1">Manage your mobile money wallets</p>
            </div>
            {onAddAccount && (
              <button
                onClick={onAddAccount}
                className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Add Account
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 py-8">
        {accounts.length === 0 ? (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-5xl mb-4">💰</div>
            <h2 className="text-xl font-semibold text-gray-800 mb-2">
              No Mobile Money Accounts
            </h2>
            <p className="text-gray-600 mb-6">
              Add your mobile money accounts to send and receive money instantly
            </p>
            {onAddAccount && (
              <button
                onClick={onAddAccount}
                className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Your First Account
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="bg-white rounded-lg border border-gray-200 hover:shadow-lg transition-shadow overflow-hidden"
              >
                {/* Card Header */}
                <div className="bg-gradient-to-r from-green-50 to-green-100 p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{getProviderIcon(account.provider)}</span>
                    <div>
                      <h3 className="font-semibold text-gray-900">{account.provider}</h3>
                      <p className="text-xs text-gray-600">{account.displayName}</p>
                    </div>
                  </div>
                  {account.isDefault && (
                    <span className="bg-green-600 text-white text-xs font-medium px-2 py-1 rounded-full">
                      Default
                    </span>
                  )}
                </div>

                {/* Card Body */}
                <div className="p-4 space-y-4">
                  {/* Phone Number */}
                  <div>
                    <p className="text-xs text-gray-600 mb-1">Phone Number</p>
                    <p className="font-semibold text-gray-900">{account.phoneNumber}</p>
                  </div>

                  {/* Balance */}
                  {account.balance !== undefined && (
                    <div className="pt-2 border-t border-gray-200">
                      <p className="text-xs text-gray-600 mb-1">Available Balance</p>
                      <p className="text-lg font-bold text-gray-900">
                        ${account.balance.toFixed(2)}
                      </p>
                    </div>
                  )}

                  {/* Last Transaction */}
                  {account.lastTransaction && (
                    <div>
                      <p className="text-xs text-gray-600 mb-1">Last Transaction</p>
                      <p className="text-sm text-gray-700">
                        {account.lastTransaction.type === 'sent' ? '↗' : '↙'}
                        {' '}${account.lastTransaction.amount.toFixed(2)}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(account.lastTransaction.date).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                {/* Card Footer */}
                <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex gap-2">
                  {onSendMoney && (
                    <button
                      onClick={() => onSendMoney(account)}
                      className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Send Money
                    </button>
                  )}
                  <div className="relative group">
                    <button className="px-3 py-2 hover:bg-gray-200 rounded-lg transition-colors">
                      <MoreVertical className="w-4 h-4 text-gray-600" />
                    </button>
                    {/* Dropdown Menu */}
                    <div className="absolute right-0 mt-0 w-56 bg-white border border-gray-200 rounded-lg shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      {!account.isDefault && (
                        <button
                          onClick={() => onSetDefault(account.id)}
                          className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                        >
                          <Bookmark className="w-4 h-4" />
                          <span>Set as Default</span>
                        </button>
                      )}
                      <button
                        onClick={() => handleCopyPhoneNumber(account.phoneNumber)}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2 border-t border-gray-100"
                      >
                        <Copy className="w-4 h-4" />
                        <span>{copiedId === account.phoneNumber ? 'Copied!' : 'Copy Number'}</span>
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(account.id)}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2 border-t border-gray-100"
                      >
                        <Trash2 className="w-4 h-4" />
                        Remove Account
                      </button>
                    </div>
                  </div>
                </div>

                {/* Delete Confirmation */}
                {showDeleteConfirm === account.id && (
                  <div className="bg-red-50 border-t border-red-200 px-4 py-3 space-y-3">
                    <p className="text-sm text-red-800 font-medium">
                      Remove this account?
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          onDeleteAccount(account.id);
                          setShowDeleteConfirm(null);
                        }}
                        className="flex-1 px-3 py-1 bg-red-600 text-white text-xs font-medium rounded hover:bg-red-700 transition-colors"
                      >
                        Remove
                      </button>
                      <button
                        onClick={() => setShowDeleteConfirm(null)}
                        className="flex-1 px-3 py-1 bg-gray-200 text-gray-800 text-xs font-medium rounded hover:bg-gray-300 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default MobileMoneyAccounts;
