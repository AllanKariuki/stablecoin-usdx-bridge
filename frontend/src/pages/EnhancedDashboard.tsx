import React, { useState } from 'react';
import {
  BarChart3,
  TrendingUp,
  Shield,
  FileText,
  Wallet,
  Target,
  PiggyBank,
  CreditCard,
  AlertCircle,
  ChevronRight,
} from 'lucide-react';

/**
 * Enhanced Financial Dashboard
 * 
 * Comprehensive dashboard for managing:
 * - Cryptocurrency & Fiat wallets
 * - Insurance policies
 * - Bill payments & recurring payments
 * - Investments & portfolio
 * - Loans & credit
 * - Savings accounts & fixed deposits
 * - Budget & expense tracking
 * - Financial goals & wealth management
 * - Rewards & cashback programs
 * - Tax documents & compliance
 */

interface FinancialMetrics {
  label: string;
  value: string;
  change: string;
  isPositive: boolean;
  icon: React.ReactNode;
  color: string;
}

const EnhancedDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'overview' | 'wallets' | 'insurance' | 'investments' | 'loans'>('overview');

  // Financial Metrics
  const metrics: FinancialMetrics[] = [
    {
      label: 'Net Worth',
      value: '$487,340.50',
      change: '+$12,430',
      isPositive: true,
      icon: <Wallet className="w-5 h-5" />,
      color: 'bg-blue-50 text-blue-600',
    },
    {
      label: 'Monthly Income',
      value: '$8,540.00',
      change: '+$500',
      isPositive: true,
      icon: <TrendingUp className="w-5 h-5" />,
      color: 'bg-green-50 text-green-600',
    },
    {
      label: 'Total Assets',
      value: '$642,180.75',
      change: '+2.4%',
      isPositive: true,
      icon: <BarChart3 className="w-5 h-5" />,
      color: 'bg-purple-50 text-purple-600',
    },
    {
      label: 'Total Liabilities',
      value: '$154,840.25',
      change: '-$5,200',
      isPositive: true,
      icon: <CreditCard className="w-5 h-5" />,
      color: 'bg-orange-50 text-orange-600',
    },
  ];

  const financialActivities = [
    {
      id: 1,
      title: 'Insurance',
      description: 'Manage health, auto, home & life insurance policies',
      icon: Shield,
      color: 'from-blue-400 to-blue-600',
      stats: { active: 4, pending: 1, value: '$2,450/yr' },
    },
    {
      id: 2,
      title: 'Bill Payments',
      description: 'Pay bills, set reminders & auto-pay recurring expenses',
      icon: FileText,
      color: 'from-green-400 to-green-600',
      stats: { upcomingDue: 3, paidThisMonth: 8, amount: '$1,250' },
    },
    {
      id: 3,
      title: 'Investments',
      description: 'Stocks, bonds, mutual funds, ETFs & crypto investments',
      icon: TrendingUp,
      color: 'from-purple-400 to-purple-600',
      stats: { portfolio: '$245,680', gain: '+$12,450', gainPercent: '+5.3%' },
    },
    {
      id: 4,
      title: 'Savings & Deposits',
      description: 'Fixed deposits, recurring deposits & high-yield savings',
      icon: PiggyBank,
      color: 'from-yellow-400 to-yellow-600',
      stats: { totalSavings: '$95,200', interestEarned: '$2,340' },
    },
    {
      id: 5,
      title: 'Loans & Credit',
      description: 'Personal loans, mortgages, auto loans & lines of credit',
      icon: CreditCard,
      color: 'from-red-400 to-red-600',
      stats: { active: 2, balance: '$124,500', nextPayment: '$2,450' },
    },
    {
      id: 6,
      title: 'Financial Goals',
      description: 'Set & track savings goals, retirement planning & budgets',
      icon: Target,
      color: 'from-indigo-400 to-indigo-600',
      stats: { goals: 6, onTrack: 4, progress: '67%' },
    },
  ];

  const pendingActions = [
    {
      id: 1,
      type: 'BILL_DUE',
      title: 'Electricity Bill Due Today',
      description: 'Your electricity bill of $245.50 is due today',
      priority: 'HIGH',
      action: 'Pay Now',
    },
    {
      id: 2,
      type: 'INSURANCE_RENEWAL',
      title: 'Car Insurance Renewal',
      description: 'Your auto insurance policy expires in 5 days',
      priority: 'MEDIUM',
      action: 'Renew Now',
    },
    {
      id: 3,
      type: 'DEPOSIT_MATURITY',
      title: 'Fixed Deposit Maturity',
      description: 'Your FD of $20,000 matures tomorrow',
      priority: 'MEDIUM',
      action: 'View Options',
    },
    {
      id: 4,
      type: 'GOAL_UPDATE',
      title: 'Monthly Budget Review',
      description: "You've spent $2,450 of your $3,500 monthly budget",
      priority: 'LOW',
      action: 'Review',
    },
  ];

  const recentTransactions = [
    { id: 1, description: 'Electricity Bill Payment', date: 'Today', amount: '-$245.50', status: 'Completed' },
    { id: 2, description: 'Salary Deposit', date: 'Yesterday', amount: '+$8,540.00', status: 'Completed' },
    { id: 3, description: 'Investment Purchase - AAPL', date: '2 days ago', amount: '-$5,000.00', status: 'Completed' },
    { id: 4, description: 'Insurance Premium', date: '5 days ago', amount: '-$450.00', status: 'Completed' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Financial Dashboard</h1>
        <p className="text-gray-600">Manage all your financial activities in one place</p>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {metrics.map((metric) => (
          <div key={metric.label} className="bg-white border border-gray-200 rounded-lg p-6">
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${metric.color}`}>
              {metric.icon}
            </div>
            <p className="text-gray-600 text-sm mb-1">{metric.label}</p>
            <h3 className="text-2xl font-bold text-gray-900 mb-2">{metric.value}</h3>
            <p className={`text-sm font-semibold ${metric.isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {metric.change}
            </p>
          </div>
        ))}
      </div>

      {/* Financial Activities Grid */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">Financial Activities</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {financialActivities.map((activity) => {
            const IconComponent = activity.icon;
            return (
              <div
                key={activity.id}
                className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer group"
              >
                {/* Card Header */}
                <div className={`bg-gradient-to-br ${activity.color} rounded-lg p-4 mb-4 text-white`}>
                  <IconComponent className="w-8 h-8" />
                </div>

                {/* Content */}
                <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-blue-600 transition-colors">
                  {activity.title}
                </h3>
                <p className="text-sm text-gray-600 mb-4">{activity.description}</p>

                {/* Stats Grid */}
                <div className="bg-gray-50 rounded-lg p-4 mb-4">
                  <div className="grid grid-cols-2 gap-3">
                    {Object.entries(activity.stats).map(([key, value]) => (
                      <div key={key}>
                        <p className="text-xs text-gray-600 capitalize mb-1">{key.replace(/([A-Z])/g, ' $1')}</p>
                        <p className="font-semibold text-gray-900 text-sm">{value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Action Button */}
                <button className="w-full px-4 py-2 bg-gray-100 hover:bg-blue-600 hover:text-white text-gray-900 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2">
                  Explore
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Pending Actions & Recent Activity */}
        <div className="lg:col-span-2">
          {/* Pending Actions */}
          <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
              <AlertCircle className="w-6 h-6 text-orange-600" />
              Action Required
            </h2>
            <div className="space-y-3">
              {pendingActions.map((action) => (
                <div
                  key={action.id}
                  className={`p-4 rounded-lg border-l-4 ${
                    action.priority === 'HIGH'
                      ? 'bg-red-50 border-red-400'
                      : action.priority === 'MEDIUM'
                        ? 'bg-yellow-50 border-yellow-400'
                        : 'bg-blue-50 border-blue-400'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-gray-900 mb-1">{action.title}</h4>
                      <p className="text-sm text-gray-600">{action.description}</p>
                    </div>
                  </div>
                  <button className="mt-3 text-sm font-semibold text-blue-600 hover:text-blue-700">
                    {action.action} →
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Transactions */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Recent Transactions</h2>
            <div className="space-y-3">
              {recentTransactions.map((transaction) => (
                <div key={transaction.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-lg transition-colors">
                  <div>
                    <p className="font-semibold text-gray-900">{transaction.description}</p>
                    <p className="text-sm text-gray-500">{transaction.date}</p>
                  </div>
                  <div className="text-right">
                    <p className={`font-bold ${transaction.amount.startsWith('-') ? 'text-red-600' : 'text-green-600'}`}>
                      {transaction.amount}
                    </p>
                    <p className="text-xs text-gray-500">{transaction.status}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column - Quick Stats & Alerts */}
        <div className="space-y-6">
          {/* Monthly Budget Overview */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Monthly Budget</h3>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Spent</span>
                  <span className="font-semibold text-gray-900">$2,450 / $3,500</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '70%' }} />
                </div>
              </div>
              <p className="text-xs text-gray-600">$1,050 remaining (30%)</p>
            </div>
          </div>

          {/* Insurance Summary */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Insurance Coverage</h3>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Health Insurance</span>
                <span className="text-xs font-semibold text-green-600">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Auto Insurance</span>
                <span className="text-xs font-semibold text-green-600">Active</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-600">Home Insurance</span>
                <span className="text-xs font-semibold text-yellow-600">Expires in 5d</span>
              </div>
              <div className="pt-3 border-t border-gray-200">
                <p className="text-sm font-semibold text-gray-700">
                  Total Coverage: $750K
                </p>
              </div>
            </div>
          </div>

          {/* Savings Progress */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Savings Goals</h3>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Emergency Fund</span>
                  <span className="text-xs font-semibold text-blue-600">67%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-green-600 h-2 rounded-full" style={{ width: '67%' }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">$6,700 / $10,000</p>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Vacation Fund</span>
                  <span className="text-xs font-semibold text-blue-600">45%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div className="bg-blue-600 h-2 rounded-full" style={{ width: '45%' }} />
                </div>
                <p className="text-xs text-gray-500 mt-1">$2,250 / $5,000</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer CTA */}
      <div className="mt-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-lg p-8 text-white">
        <div className="max-w-2xl">
          <h3 className="text-2xl font-bold mb-2">Optimize Your Financial Health</h3>
          <p className="mb-4 opacity-90">
            Get personalized recommendations to improve your savings, investments, and overall financial wellness.
          </p>
          <button className="px-6 py-2 bg-white text-blue-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors">
            View Recommendations
          </button>
        </div>
      </div>
    </div>
  );
};

export default EnhancedDashboard;
