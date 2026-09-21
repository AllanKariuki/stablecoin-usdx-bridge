/**
 * ConvertWallets Page
 * Multi-currency wallet management for conversions
 */

import { useState } from 'react';
import { Plus, Eye, EyeOff, TrendingUp, Lock } from 'lucide-react';
import { useConversion } from '../../hooks/useConversion';

/**
 * ConvertWallets - View and manage wallets for currency conversion
 */
export default function ConvertWallets() {
  const { wallets } = useConversion();
  const [showBalances, setShowBalances] = useState(true);

  const totalValue = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Exchange Wallets</h1>
            <p className="text-gray-600">Manage your multi-currency wallets</p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            <Plus className="w-4 h-4" />
            Add Wallet
          </button>
        </div>

        {/* Total Balance Card */}
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg p-8 text-white mb-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="text-blue-100 mb-2">Total Balance</p>
              <h2 className="text-4xl font-bold">
                {showBalances
                  ? `$${totalValue.toLocaleString('en-US', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}`
                  : '••••••'}
              </h2>
            </div>
            <button
              onClick={() => setShowBalances(!showBalances)}
              className="p-3 bg-white/20 hover:bg-white/30 rounded-full transition-colors"
            >
              {showBalances ? (
                <EyeOff className="w-6 h-6" />
              ) : (
                <Eye className="w-6 h-6" />
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <p className="text-blue-100 text-sm mb-1">Available</p>
              <p className="text-2xl font-bold">
                {showBalances
                  ? `$${wallets
                      .reduce((sum, w) => sum + w.available, 0)
                      .toLocaleString('en-US', {
                        maximumFractionDigits: 2,
                      })}`
                  : '••••••'}
              </p>
            </div>
            <div>
              <p className="text-blue-100 text-sm mb-1">Wallets</p>
              <p className="text-2xl font-bold">{wallets.length}</p>
            </div>
            <div>
              <p className="text-blue-100 text-sm mb-1">Status</p>
              <p className="text-2xl font-bold flex items-center gap-2">
                <Lock className="w-5 h-5" />
                Active
              </p>
            </div>
          </div>
        </div>

        {/* Wallets Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
          {wallets.map((wallet) => (
            <div
              key={wallet.id}
              className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{wallet.currency}</h3>
                  <p className="text-sm text-gray-600">
                    {wallet.currency === 'USD'
                      ? 'US Dollar'
                      : wallet.currency === 'EUR'
                      ? 'Euro'
                      : wallet.currency === 'GBP'
                      ? 'British Pound'
                      : wallet.currency}
                  </p>
                </div>
                <TrendingUp className="w-5 h-5 text-green-600" />
              </div>

              <div className="space-y-3 mb-6 pb-6 border-b border-gray-200">
                <div>
                  <p className="text-xs text-gray-600 mb-1">Balance</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {showBalances
                      ? `${wallet.balance.toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })}`
                      : '••••••'}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-600 mb-1">Available</p>
                  <p className="text-lg font-semibold text-green-600">
                    {showBalances
                      ? `${wallet.available.toLocaleString('en-US', {
                          maximumFractionDigits: 2,
                        })}`
                      : '••••••'}
                  </p>
                </div>
                <div className="text-xs text-gray-500">
                  Updated {new Date(wallet.lastUpdated).toRelativeTime?.() || 'recently'}
                </div>
              </div>

              <button className="w-full px-4 py-2 text-blue-600 font-semibold hover:bg-blue-50 rounded-lg transition-colors">
                Use this Wallet
              </button>
            </div>
          ))}
        </div>

        {/* Empty State */}
        {wallets.length === 0 && (
          <div className="bg-white rounded-lg border border-gray-200 p-12 text-center">
            <div className="text-gray-400 text-4xl mb-4">💼</div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">No Wallets Yet</h3>
            <p className="text-gray-600 mb-6">Create your first wallet to start converting currencies</p>
            <button className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-4 h-4" />
              Create Wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
