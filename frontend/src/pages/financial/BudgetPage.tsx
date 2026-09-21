import React from 'react';
import { ArrowLeft, Plus, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Budget & Expense Tracking Page
 * Displays budgets and expense tracking
 */
export default function BudgetPage() {
  const [budgets] = React.useState([
    {
      id: 'budget-001',
      name: 'Monthly Budget',
      month: 'November 2024',
      totalBudget: 500000,
      spent: 350000,
      categories: [
        { name: 'Food & Dining', budget: 100000, spent: 75000 },
        { name: 'Transportation', budget: 80000, spent: 65000 },
        { name: 'Utilities', budget: 50000, spent: 45000 },
        { name: 'Entertainment', budget: 40000, spent: 52000 },
        { name: 'Shopping', budget: 120000, spent: 98000 },
        { name: 'Health', budget: 60000, spent: 55000 },
        { name: 'Other', budget: 50000, spent: 0 }
      ]
    }
  ]);

  const getUsagePercent = (spent: number, budget: number) => {
    return Math.round((spent / budget) * 100);
  };

  const getStatusColor = (percent: number) => {
    if (percent > 100) return 'text-red-600';
    if (percent > 80) return 'text-orange-600';
    return 'text-green-600';
  };

  const getBgColor = (percent: number) => {
    if (percent > 100) return 'bg-red-500';
    if (percent > 80) return 'bg-orange-500';
    return 'bg-green-500';
  };

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
                <h1 className="text-2xl font-bold text-slate-900">Budget & Expenses</h1>
                <p className="text-slate-600 text-sm mt-1">Track your spending and manage budgets</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" />
              New Budget
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {budgets.map((budget) => (
          <div key={budget.id}>
            {/* Budget Summary */}
            <div className="bg-white rounded-lg border border-slate-200 p-6 mb-8">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-900">{budget.name}</h2>
                  <p className="text-slate-600 text-sm">{budget.month}</p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-slate-900">
                    ${(budget.spent / 100000).toFixed(1)}K / ${(budget.totalBudget / 100000).toFixed(1)}K
                  </p>
                  <p className={`text-lg font-bold ${getStatusColor(getUsagePercent(budget.spent, budget.totalBudget))}`}>
                    {getUsagePercent(budget.spent, budget.totalBudget)}% used
                  </p>
                </div>
              </div>

              {/* Overall Progress Bar */}
              <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                <div
                  className={`h-full ${getBgColor(getUsagePercent(budget.spent, budget.totalBudget))} transition-all`}
                  style={{ width: `${Math.min(getUsagePercent(budget.spent, budget.totalBudget), 100)}%` }}
                />
              </div>

              <div className="mt-4 text-sm text-slate-600">
                ${((budget.totalBudget - budget.spent) / 100000).toFixed(1)}K remaining
              </div>
            </div>

            {/* Category Breakdown */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-slate-900 mb-4">Category Breakdown</h3>
              
              {budget.categories.map((category) => {
                const percent = getUsagePercent(category.spent, category.budget);
                return (
                  <div key={category.name} className="bg-white rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-medium text-slate-900">{category.name}</h4>
                          {percent > 100 && (
                            <AlertCircle className="w-4 h-4 text-red-600" />
                          )}
                        </div>
                        <p className="text-sm text-slate-600">
                          ${(category.spent / 1000).toFixed(0)}K of ${(category.budget / 1000).toFixed(0)}K
                        </p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${getStatusColor(percent)}`}>
                          {percent}%
                        </p>
                      </div>
                    </div>
                    
                    {/* Progress Bar */}
                    <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-full ${getBgColor(percent)} transition-all`}
                        style={{ width: `${Math.min(percent, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Quick Actions */}
            <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
              <button className="bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium">
                Add Expense
              </button>
              <button className="bg-slate-600 text-white py-3 px-4 rounded-lg hover:bg-slate-700 transition-colors font-medium">
                View Reports
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
