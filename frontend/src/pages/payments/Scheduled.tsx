import { useState } from 'react';
import { Search, Plus, Edit2, Trash2, Calendar, ChevronDown } from 'lucide-react';
import type { ScheduledPayment } from '../../types/financial';

const Scheduled = () => {
  const [showForm, setShowForm] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused' | 'completed'>('all');

  // Mock data
  const payments: ScheduledPayment[] = [
    {
      id: '1',
      userId: 'user1',
      recipientName: 'Amazon Web Services',
      recipientAccount: 'AWS-5432',
      amount: 299.99,
      currency: 'USD',
      description: 'Monthly AWS subscription',
      schedule: {
        frequency: 'monthly',
        startDate: '2024-01-01',
        nextExecutionDate: '2024-02-01',
        isActive: true
      },
      status: 'active',
      lastExecuted: '2024-01-01T09:00:00Z',
      createdAt: '2023-12-15T10:00:00Z',
      updatedAt: '2024-01-01T09:00:00Z'
    },
    {
      id: '2',
      userId: 'user1',
      recipientName: 'Netflix Inc.',
      recipientAccount: 'NETFLIX-001',
      amount: 15.99,
      currency: 'USD',
      description: 'Netflix Premium subscription',
      schedule: {
        frequency: 'monthly',
        startDate: '2023-11-15',
        nextExecutionDate: '2024-02-15',
        isActive: true
      },
      status: 'active',
      lastExecuted: '2024-01-15T08:30:00Z',
      createdAt: '2023-11-15T10:00:00Z',
      updatedAt: '2024-01-15T08:30:00Z'
    },
    {
      id: '3',
      userId: 'user1',
      recipientName: 'City Water Department',
      recipientAccount: 'WATER-5678',
      amount: 85.50,
      currency: 'USD',
      description: 'Monthly water bill',
      schedule: {
        frequency: 'monthly',
        startDate: '2023-10-01',
        nextExecutionDate: '2024-02-01',
        isActive: true,
        dayOfMonth: 1
      },
      status: 'active',
      lastExecuted: '2024-01-01T06:00:00Z',
      createdAt: '2023-10-01T10:00:00Z',
      updatedAt: '2024-01-01T06:00:00Z'
    },
    {
      id: '4',
      userId: 'user1',
      recipientName: 'John Smith',
      recipientAccount: 'JOHN-TRANSFER',
      amount: 500,
      currency: 'USD',
      description: 'Bi-weekly allowance',
      schedule: {
        frequency: 'weekly',
        startDate: '2024-01-01',
        nextExecutionDate: '2024-02-05',
        isActive: false,
        daysOfWeek: [1, 3] // Monday, Wednesday
      },
      status: 'paused',
      lastExecuted: '2024-01-22T09:00:00Z',
      createdAt: '2024-01-01T10:00:00Z',
      updatedAt: '2024-01-25T14:00:00Z'
    },
    {
      id: '5',
      userId: 'user1',
      recipientName: 'Gym Membership',
      recipientAccount: 'GYM-ANNUAL',
      amount: 600,
      currency: 'USD',
      description: 'Annual gym membership renewal',
      schedule: {
        frequency: 'yearly',
        startDate: '2023-01-15',
        endDate: '2024-01-15',
        nextExecutionDate: '2025-01-15',
        isActive: true
      },
      status: 'completed',
      lastExecuted: '2024-01-15T10:30:00Z',
      createdAt: '2023-01-15T10:00:00Z',
      updatedAt: '2024-01-15T10:30:00Z'
    }
  ];

  const filteredPayments = payments
    .filter(payment => {
      const matchesSearch = 
        payment.recipientName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.description.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesStatus = filterStatus === 'all' || payment.status === filterStatus;
      return matchesSearch && matchesStatus;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'paused':
        return 'bg-yellow-100 text-yellow-800';
      case 'completed':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getFrequencyLabel = (frequency: string) => {
    return frequency.charAt(0).toUpperCase() + frequency.slice(1);
  };

  const stats = {
    total: payments.length,
    active: payments.filter(p => p.status === 'active').length,
    paused: payments.filter(p => p.status === 'paused').length,
    monthlyTotal: payments
      .filter(p => p.status === 'active' && p.schedule.frequency === 'monthly')
      .reduce((sum, p) => sum + p.amount, 0)
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Scheduled Payments</h1>
            <p className="text-gray-600 mt-1">Manage your recurring and scheduled payments</p>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            New Schedule
          </button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Total Schedules</p>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Active</p>
            <p className="text-2xl font-bold text-green-600 mt-1">{stats.active}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Paused</p>
            <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.paused}</p>
          </div>
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <p className="text-gray-600 text-sm">Monthly Total</p>
            <p className="text-2xl font-bold text-blue-600 mt-1">${stats.monthlyTotal.toFixed(2)}</p>
          </div>
        </div>

        {/* New Schedule Form */}
        {showForm && (
          <div className="bg-white rounded-lg p-6 border border-gray-200 mb-6">
            <h2 className="text-lg font-bold text-gray-900 mb-6">Create Scheduled Payment</h2>
            
            <form className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Recipient */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Recipient</label>
                  <input
                    type="text"
                    placeholder="Recipient name"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Account */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Account</label>
                  <input
                    type="text"
                    placeholder="Account number/ID"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Amount</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="0.00"
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <select className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option>USD</option>
                      <option>EUR</option>
                      <option>GBP</option>
                    </select>
                  </div>
                </div>

                {/* Frequency */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Frequency</label>
                  <select className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                    <option>Monthly</option>
                    <option>Weekly</option>
                    <option>Bi-weekly</option>
                    <option>Quarterly</option>
                    <option>Yearly</option>
                  </select>
                </div>

                {/* Description */}
                <div className="md:col-span-2">
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Description</label>
                  <input
                    type="text"
                    placeholder="e.g., Monthly subscription"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Start Date */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Start Date</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* End Date (Optional) */}
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">End Date (Optional)</label>
                  <input
                    type="date"
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-2 pt-4">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Create Schedule
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Search */}
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search by recipient or description..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Status Filter */}
            <div className="relative">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
              >
                <option value="all">All Status</option>
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="completed">Completed</option>
              </select>
              <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {/* Payments Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Recipient</th>
                  <th className="px-6 py-3 text-right text-sm font-semibold text-gray-700">Amount</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Description</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Frequency</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Status</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Next Payment</th>
                  <th className="px-6 py-3 text-left text-sm font-semibold text-gray-700">Last Payment</th>
                  <th className="px-6 py-3 text-center text-sm font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.length > 0 ? (
                  filteredPayments.map((payment) => (
                    <tr key={payment.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{payment.recipientName}</td>
                      <td className="px-6 py-4 text-sm text-right font-semibold text-gray-900">
                        {payment.amount} {payment.currency}
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">{payment.description}</td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {getFrequencyLabel(payment.schedule.frequency)}
                      </td>
                      <td className="px-6 py-4 text-sm">
                        <span className={`px-3 py-1 rounded-full font-medium text-xs ${getStatusColor(payment.status)}`}>
                          {payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          {new Date(payment.schedule.nextExecutionDate).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-600">
                        {payment.lastExecuted ? new Date(payment.lastExecuted).toLocaleDateString() : 'Never'}
                      </td>
                      <td className="px-6 py-4 text-center flex gap-2 justify-center">
                        <button className="text-blue-600 hover:text-blue-800">
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button className="text-red-600 hover:text-red-800">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="px-6 py-8 text-center text-gray-500">
                      No scheduled payments found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Scheduled;
