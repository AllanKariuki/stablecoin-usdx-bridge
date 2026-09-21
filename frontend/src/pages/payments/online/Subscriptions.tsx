import React, { useState } from 'react';
import { Plus, ArrowLeft, CheckCircle, Trash2, Filter } from 'lucide-react';
import SearchableTable from '../../../components/general/SearchableTable';
import type { FilterConfig } from '../../../types/general/searchTable';

interface Subscription {
  id: string;
  name: string;
  provider: string;
  amount: number;
  frequency: 'monthly' | 'yearly' | 'quarterly';
  nextBillingDate: string;
  icon: string;
  status: 'active' | 'paused' | 'cancelled';
}

interface SubscriptionTransaction {
  id: string;
  subscriptionName: string;
  provider: string;
  amount: number;
  fee: number;
  total: number;
  frequency: 'monthly' | 'yearly' | 'quarterly';
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  paymentMethod: 'card' | 'wallet' | 'bank_transfer';
  reference: string;
  paidAt: string;
  nextBillingDate: string;
  createdAt: string;
}

const Subscriptions: React.FC = () => {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([
    {
      id: 's1',
      name: 'Netflix Premium',
      provider: 'Netflix',
      amount: 15.99,
      frequency: 'monthly',
      nextBillingDate: '2025-12-17',
      icon: '🎬',
      status: 'active',
    },
    {
      id: 's2',
      name: 'Spotify',
      provider: 'Spotify',
      amount: 10.99,
      frequency: 'monthly',
      nextBillingDate: '2025-12-10',
      icon: '🎵',
      status: 'active',
    },
  ]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    provider: '',
    amount: '',
    frequency: 'monthly' as const,
  });

  const handleAddSubscription = () => {
    if (formData.name && formData.provider && formData.amount) {
      const newSubscription: Subscription = {
        id: `s${subscriptions.length + 1}`,
        name: formData.name,
        provider: formData.provider,
        amount: parseFloat(formData.amount),
        frequency: formData.frequency,
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
          .toISOString()
          .split('T')[0],
        icon: '📱',
        status: 'active',
      };
      setSubscriptions([...subscriptions, newSubscription]);
      setFormData({ name: '', provider: '', amount: '', frequency: 'monthly' });
      setShowAddForm(false);
    }
  };

  const handleRemoveSubscription = (id: string) => {
    setSubscriptions(subscriptions.filter((s) => s.id !== id));
  };

  const activeSubscriptions = subscriptions.filter((s) => s.status === 'active');
  const totalMonthly = activeSubscriptions
    .filter((s) => s.frequency === 'monthly')
    .reduce((sum, s) => sum + s.amount, 0);

  // Mock subscription payment history data
  const subscriptionHistory: SubscriptionTransaction[] = [
    {
      id: '1',
      subscriptionName: 'Netflix Premium',
      provider: 'Netflix',
      amount: 15.99,
      fee: 0.80,
      total: 16.79,
      frequency: 'monthly',
      status: 'completed',
      paymentMethod: 'card',
      reference: 'NFX-PRE-2025-01-17',
      paidAt: '2025-01-17T08:00:00Z',
      nextBillingDate: '2025-02-17',
      createdAt: '2025-01-17T08:00:00Z',
    },
    {
      id: '2',
      subscriptionName: 'Spotify',
      provider: 'Spotify',
      amount: 10.99,
      fee: 0.55,
      total: 11.54,
      frequency: 'monthly',
      status: 'completed',
      paymentMethod: 'wallet',
      reference: 'SPO-PRE-2025-01-10',
      paidAt: '2025-01-10T12:30:00Z',
      nextBillingDate: '2025-02-10',
      createdAt: '2025-01-10T12:30:00Z',
    },
    {
      id: '3',
      subscriptionName: 'Adobe Creative Cloud',
      provider: 'Adobe',
      amount: 54.99,
      fee: 2.75,
      total: 57.74,
      frequency: 'monthly',
      status: 'completed',
      paymentMethod: 'card',
      reference: 'ADO-PRE-2025-01-15',
      paidAt: '2025-01-15T09:00:00Z',
      nextBillingDate: '2025-02-15',
      createdAt: '2025-01-15T09:00:00Z',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-blue-100 text-blue-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'card':
        return 'Credit Card';
      case 'wallet':
        return 'Wallet';
      case 'bank_transfer':
        return 'Bank Transfer';
      default:
        return method;
    }
  };

  const columns = [
    {
      header: 'Subscription',
      accessor: 'subscriptionName',
      render: (_: any, record: SubscriptionTransaction) => (
        <div>
          <p className="font-medium text-gray-900">{record.subscriptionName}</p>
          <p className="text-xs text-gray-600">{record.provider}</p>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (_: any, record: SubscriptionTransaction) => (
        <div>
          <p className="font-semibold text-gray-900">
            ${record.amount.toFixed(2)}
          </p>
          <p className="text-xs text-gray-600">Fee: ${record.fee.toFixed(2)}</p>
        </div>
      ),
    },
    {
      header: 'Total',
      accessor: 'total',
      render: (_: any, record: SubscriptionTransaction) => (
        <span className="font-bold text-gray-900">
          ${record.total.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Frequency',
      accessor: 'frequency',
      render: (_: any, record: SubscriptionTransaction) => (
        <span className="text-gray-600 capitalize">
          {record.frequency}
        </span>
      ),
    },
    {
      header: 'Payment Method',
      accessor: 'paymentMethod',
      render: (_: any, record: SubscriptionTransaction) => (
        <span className="text-gray-600">
          {getPaymentMethodLabel(record.paymentMethod)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (_: any, record: SubscriptionTransaction) => (
        <span
          className={`px-3 py-1 rounded-full font-medium text-xs ${getStatusColor(
            record.status
          )}`}
        >
          {record.status.charAt(0).toUpperCase() + record.status.slice(1)}
        </span>
      ),
    },
    {
      header: 'Next Billing',
      accessor: 'nextBillingDate',
      render: (_: any, record: SubscriptionTransaction) => (
        <span className="text-gray-600">
          {new Date(record.nextBillingDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      render: (_: any, record: SubscriptionTransaction) => (
        <span className="text-xs font-mono text-gray-600">{record.reference}</span>
      ),
    },
  ];

  const filters: FilterConfig[] = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { label: 'All', value: '' },
        { label: 'Completed', value: 'completed' },
        { label: 'Pending', value: 'pending' },
        { label: 'Failed', value: 'failed' },
        { label: 'Cancelled', value: 'cancelled' },
      ],
    },
    {
      key: 'frequency',
      label: 'Frequency',
      options: [
        { label: 'All', value: '' },
        { label: 'Monthly', value: 'monthly' },
        { label: 'Quarterly', value: 'quarterly' },
        { label: 'Yearly', value: 'yearly' },
      ],
    },
    {
      key: 'paymentMethod',
      label: 'Payment Method',
      options: [
        { label: 'All', value: '' },
        { label: 'Credit Card', value: 'card' },
        { label: 'Wallet', value: 'wallet' },
        { label: 'Bank Transfer', value: 'bank_transfer' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-800">Subscriptions</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHistory(!showHistory)}
              className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
            >
              <Filter className="w-5 h-5" />
              History
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Add Subscription
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Payment History Section */}
        {showHistory && (
          <div className="mb-8">
            <SearchableTable
              data={subscriptionHistory}
              columns={columns}
              filters={filters}
              searchPlaceholder="Search by subscription name, provider, or reference..."
              title="Subscription Payment History"
              titleIcon={<Filter className="w-5 h-5 mr-2 text-gray-600" />}
              description="View all your subscription payments"
              actionButton={{
                label: 'Back to Subscriptions',
                onClick: () => setShowHistory(false),
                className:
                  'px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors',
              }}
            />
          </div>
        )}

        {/* Add Form */}
        {showAddForm && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">New Subscription</h2>
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Service Name (e.g., Netflix)"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="text"
                placeholder="Provider"
                value={formData.provider}
                onChange={(e) => setFormData({ ...formData, provider: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="grid grid-cols-2 gap-4">
                <input
                  type="number"
                  placeholder="Amount"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
                <select
                  value={formData.frequency}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      frequency: e.target.value as 'monthly' | 'yearly' | 'quarterly',
                    })
                  }
                  className="px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="monthly">Monthly</option>
                  <option value="quarterly">Quarterly</option>
                  <option value="yearly">Yearly</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAddSubscription}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Add Subscription
                </button>
                <button
                  onClick={() => setShowAddForm(false)}
                  className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600 text-sm">Active Subscriptions</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">{activeSubscriptions.length}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600 text-sm">Monthly Cost</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">${totalMonthly.toFixed(2)}</p>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-6">
            <p className="text-gray-600 text-sm">Annual Cost</p>
            <p className="text-3xl font-bold text-gray-800 mt-2">
              ${(totalMonthly * 12).toFixed(2)}
            </p>
          </div>
        </div>

        {/* Subscriptions List */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">Your Subscriptions</h2>
          {subscriptions.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <p className="text-gray-600">No subscriptions yet</p>
            </div>
          ) : (
            subscriptions.map((subscription) => (
              <div
                key={subscription.id}
                className="bg-white rounded-lg border border-gray-200 p-6 flex items-center justify-between"
              >
                <div className="flex items-center gap-4 flex-1">
                  <div className="text-3xl">{subscription.icon}</div>
                  <div>
                    <h3 className="font-semibold text-gray-800">{subscription.name}</h3>
                    <p className="text-sm text-gray-600">
                      ${subscription.amount.toFixed(2)} / {subscription.frequency}
                    </p>
                    <p className="text-xs text-gray-500">
                      Next billing: {new Date(subscription.nextBillingDate).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  {subscription.status === 'active' && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-green-50 text-green-700 text-sm rounded-full">
                      <CheckCircle className="w-4 h-4" />
                      Active
                    </span>
                  )}
                  <button
                    onClick={() => handleRemoveSubscription(subscription.id)}
                    className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default Subscriptions;
