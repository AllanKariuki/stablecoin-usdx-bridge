import React from 'react';
import { ArrowLeft, Plus, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Savings & Fixed Deposits Page
 * Displays savings accounts and fixed deposits
 */
export default function SavingsPage() {
  const [savingsAccounts] = React.useState([
    {
      id: 'savings-001',
      accountName: 'Emergency Fund',
      accountType: 'savings' as const,
      balance: 5200000,
      interestRate: 4.5,
      interestEarned: 187500,
      lastInterestDate: new Date('2024-10-01')
    },
    {
      id: 'savings-002',
      accountName: 'Fixed Deposit - 1 Year',
      accountType: 'fixed' as const,
      balance: 2000000,
      interestRate: 6.5,
      interestEarned: 130000,
      maturityDate: new Date('2025-11-14'),
      startDate: new Date('2024-11-14')
    }
  ]);

  const totalSavings = savingsAccounts.reduce((sum, acc) => sum + acc.balance, 0);
  const totalInterest = savingsAccounts.reduce((sum, acc) => sum + acc.interestEarned, 0);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/enhanced-dashboard" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Savings & Deposits</h1>
                <p className="text-slate-600 text-sm mt-1">Manage your savings accounts and deposits</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" />
              New Account
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Total Savings</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">${(totalSavings / 1000000).toFixed(1)}M</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Interest Earned</p>
            <div className="flex items-center gap-2 mt-2">
              <TrendingUp className="w-6 h-6 text-green-600" />
              <p className="text-3xl font-bold text-green-600">${(totalInterest / 1000).toFixed(0)}K</p>
            </div>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Active Accounts</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{savingsAccounts.length}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Avg Interest Rate</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">5.5%</p>
          </div>
        </div>

        {/* Savings Accounts */}
        <div className="space-y-4">
          {savingsAccounts.length > 0 ? (
            savingsAccounts.map((account) => (
              <div key={account.id} className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-lg transition-shadow">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">{account.accountName}</h3>
                    <p className="text-slate-600 text-sm">
                      {account.accountType === 'fixed' ? 'Fixed Deposit' : 'Savings Account'}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-slate-900">
                      ${(account.balance / 100000).toFixed(1)}K
                    </p>
                    <p className="text-sm text-green-600 font-medium">+${(account.interestEarned / 1000).toFixed(0)}K earned</p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-4 pb-4 border-b border-slate-200">
                  <div>
                    <p className="text-slate-600 text-sm">Interest Rate</p>
                    <p className="text-lg font-bold text-slate-900">{account.interestRate}%</p>
                  </div>
                  <div>
                    <p className="text-slate-600 text-sm">Interest Earned</p>
                    <p className="text-lg font-bold text-green-600">${(account.interestEarned / 1000).toFixed(0)}K</p>
                  </div>
                  {account.accountType === 'fixed' && 'maturityDate' in account && (
                    <div>
                      <p className="text-slate-600 text-sm">Maturity Date</p>
                      <p className="text-lg font-bold text-slate-900">
                        {new Date(account.maturityDate).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <button className="flex-1 px-4 py-2 bg-slate-100 text-slate-900 rounded-lg hover:bg-slate-200 transition-colors font-medium">
                    View Details
                  </button>
                  {account.accountType === 'fixed' && (
                    <button className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">
                      Renew
                    </button>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
              <p className="text-slate-600">No savings accounts found</p>
              <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium">
                Create your first savings account
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
