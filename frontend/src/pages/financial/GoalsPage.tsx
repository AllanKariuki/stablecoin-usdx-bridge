import React from 'react';
import { ArrowLeft, Plus, Target } from 'lucide-react';
import { Link } from 'react-router-dom';

/**
 * Financial Goals Page
 * Displays financial goals and progress tracking
 */
export default function GoalsPage() {
  const [goals] = React.useState([
    {
      id: 'goal-001',
      name: 'Emergency Fund',
      description: 'Build a 6-month emergency fund',
      type: 'savings' as const,
      targetAmount: 3000000,
      currentAmount: 2100000,
      targetDate: new Date('2025-12-31'),
      priority: 'high' as const,
      status: 'on-track' as const,
      createdDate: new Date('2024-01-01')
    },
    {
      id: 'goal-002',
      name: 'Home Purchase',
      description: 'Save for down payment on a house',
      type: 'investment' as const,
      targetAmount: 5000000,
      currentAmount: 2800000,
      targetDate: new Date('2026-06-30'),
      priority: 'high' as const,
      status: 'on-track' as const,
      createdDate: new Date('2023-06-01')
    },
    {
      id: 'goal-003',
      name: 'Retirement Fund',
      description: 'Build a comfortable retirement corpus',
      type: 'investment' as const,
      targetAmount: 10000000,
      currentAmount: 4500000,
      targetDate: new Date('2035-12-31'),
      priority: 'medium' as const,
      status: 'on-track' as const,
      createdDate: new Date('2020-01-01')
    },
    {
      id: 'goal-004',
      name: 'Vacation Fund',
      description: 'Plan a dream vacation',
      type: 'savings' as const,
      targetAmount: 500000,
      currentAmount: 450000,
      targetDate: new Date('2025-06-30'),
      priority: 'low' as const,
      status: 'on-track' as const,
      createdDate: new Date('2024-06-01')
    }
  ]);

  const getProgressPercent = (current: number, target: number) => {
    return Math.round((current / target) * 100);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'on-track':
        return 'bg-green-100 text-green-800';
      case 'at-risk':
        return 'bg-orange-100 text-orange-800';
      case 'off-track':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const getPriorityBadgeColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'bg-red-100 text-red-800';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'low':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-slate-100 text-slate-800';
    }
  };

  const totalTarget = goals.reduce((sum, goal) => sum + goal.targetAmount, 0);
  const totalCurrent = goals.reduce((sum, goal) => sum + goal.currentAmount, 0);
  const onTrackGoals = goals.filter(g => g.status === 'on-track').length;

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
                <h1 className="text-2xl font-bold text-slate-900">Financial Goals</h1>
                <p className="text-slate-600 text-sm mt-1">Track progress toward your financial goals</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" />
              New Goal
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Active Goals</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{goals.length}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">On Track</p>
            <p className="text-3xl font-bold text-green-600 mt-2">{onTrackGoals}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Progress</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">{getProgressPercent(totalCurrent, totalTarget)}%</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Saved</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">${(totalCurrent / 1000000).toFixed(1)}M</p>
          </div>
        </div>

        {/* Goals List */}
        <div className="space-y-4">
          {goals.length > 0 ? (
            goals.map((goal) => {
              const progress = getProgressPercent(goal.currentAmount, goal.targetAmount);
              const daysRemaining = Math.ceil((goal.targetDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
              return (
                <div key={goal.id} className="bg-white rounded-lg border border-slate-200 p-6 hover:shadow-lg transition-shadow">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Target className="w-5 h-5 text-blue-600" />
                        <h3 className="text-lg font-bold text-slate-900">{goal.name}</h3>
                      </div>
                      <p className="text-slate-600 text-sm">{goal.description}</p>
                    </div>
                    <div className="flex gap-2">
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusBadgeColor(goal.status)}`}>
                        {goal.status.replace('-', ' ')}
                      </span>
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getPriorityBadgeColor(goal.priority)}`}>
                        {goal.priority}
                      </span>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-slate-600">
                        ${(goal.currentAmount / 100000).toFixed(1)}K of ${(goal.targetAmount / 100000).toFixed(1)}K
                      </span>
                      <span className="text-lg font-bold text-slate-900">{progress}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div
                        className="h-full bg-blue-600 transition-all"
                        style={{ width: `${Math.min(progress, 100)}%` }}
                      />
                    </div>
                  </div>

                  {/* Meta Info */}
                  <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-slate-200">
                    <div>
                      <p className="text-slate-600 text-xs">Target Date</p>
                      <p className="font-medium text-slate-900">
                        {goal.targetDate.toLocaleDateString()}
                      </p>
                      <p className="text-xs text-slate-500">{daysRemaining} days remaining</p>
                    </div>
                    <div>
                      <p className="text-slate-600 text-xs">Amount Needed</p>
                      <p className="font-medium text-slate-900">
                        ${((goal.targetAmount - goal.currentAmount) / 100000).toFixed(1)}K
                      </p>
                      <p className="text-xs text-slate-500">To reach target</p>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <button className="flex-1 px-4 py-2 bg-slate-100 text-slate-900 rounded-lg hover:bg-slate-200 transition-colors font-medium">
                      Add Contribution
                    </button>
                    <button className="flex-1 px-4 py-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200 transition-colors font-medium">
                      Edit Goal
                    </button>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
              <p className="text-slate-600">No financial goals yet</p>
              <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium">
                Create your first goal
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
