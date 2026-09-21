import React, { useState } from 'react';
import { Plus, ArrowLeft, CheckCircle, PlayCircle, Filter } from 'lucide-react';
import SearchableTable from '../../../components/general/SearchableTable';
import type { FilterConfig } from '../../../types/general/searchTable';

interface StreamingService {
  id: string;
  name: string;
  provider: string;
  amount: number;
  features: string[];
  icon: string;
  status: 'active' | 'available';
}

interface StreamingTransaction {
  id: string;
  serviceName: string;
  provider: string;
  amount: number;
  fee: number;
  total: number;
  billingCycle: 'monthly' | 'yearly';
  status: 'completed' | 'pending' | 'failed' | 'cancelled';
  paymentMethod: 'card' | 'wallet' | 'bank_transfer';
  reference: string;
  nextBillingDate: string;
  paidAt: string;
  createdAt: string;
}

const Streaming: React.FC = () => {
  const [services, setServices] = useState<StreamingService[]>([
    {
      id: 'st1',
      name: 'Netflix Standard',
      provider: 'Netflix',
      amount: 15.99,
      features: ['4K Support', 'Multi-screen', 'Offline Downloads'],
      icon: '🎬',
      status: 'active',
    },
    {
      id: 'st2',
      name: 'Disney+ Premium',
      provider: 'Disney',
      amount: 13.99,
      features: ['4K Support', 'Ad-Free', 'Multi-screen'],
      icon: '👑',
      status: 'available',
    },
    {
      id: 'st3',
      name: 'Amazon Prime Video',
      provider: 'Amazon',
      amount: 14.99,
      features: ['Free Shipping', '4K Support', 'Extended Trial'],
      icon: '🎯',
      status: 'available',
    },
  ]);

  const [selectedService, setSelectedService] = useState<StreamingService | null>(null);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [paymentData, setPaymentData] = useState({
    plan: '',
    billingCycle: 'monthly',
  });

  const handleSubscribe = (service: StreamingService) => {
    setSelectedService(service);
    setShowPaymentForm(true);
  };

  const handleConfirmPayment = () => {
    if (selectedService) {
      const updatedServices = services.map((s) =>
        s.id === selectedService.id ? { ...s, status: 'active' as const } : s
      );
      setServices(updatedServices);
      setShowPaymentForm(false);
      setSelectedService(null);
      setPaymentData({ plan: '', billingCycle: 'monthly' });
    }
  };

  const activeServices = services.filter((s) => s.status === 'active');

  // Mock streaming payment history data
  const streamingHistory: StreamingTransaction[] = [
    {
      id: '1',
      serviceName: 'Netflix Standard',
      provider: 'Netflix',
      amount: 15.99,
      fee: 0.80,
      total: 16.79,
      billingCycle: 'monthly',
      status: 'completed',
      paymentMethod: 'card',
      reference: 'NFX-1599-2025-01',
      nextBillingDate: '2025-02-17',
      paidAt: '2025-01-17T08:00:00Z',
      createdAt: '2025-01-17T08:00:00Z',
    },
    {
      id: '2',
      serviceName: 'Disney+ Premium',
      provider: 'Disney',
      amount: 13.99,
      fee: 0.70,
      total: 14.69,
      billingCycle: 'monthly',
      status: 'completed',
      paymentMethod: 'wallet',
      reference: 'DIS-1399-2025-01',
      nextBillingDate: '2025-02-15',
      paidAt: '2025-01-15T10:30:00Z',
      createdAt: '2025-01-15T10:30:00Z',
    },
    {
      id: '3',
      serviceName: 'Amazon Prime Video',
      provider: 'Amazon',
      amount: 14.99,
      fee: 0.75,
      total: 15.74,
      billingCycle: 'monthly',
      status: 'completed',
      paymentMethod: 'card',
      reference: 'AMZ-1499-2025-01',
      nextBillingDate: '2025-02-10',
      paidAt: '2025-01-10T12:45:00Z',
      createdAt: '2025-01-10T12:45:00Z',
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
      header: 'Service',
      accessor: 'serviceName',
      render: (_: any, record: StreamingTransaction) => (
        <div>
          <p className="font-medium text-gray-900">{record.serviceName}</p>
          <p className="text-xs text-gray-600">{record.provider}</p>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (_: any, record: StreamingTransaction) => (
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
      render: (_: any, record: StreamingTransaction) => (
        <span className="font-bold text-gray-900">
          ${record.total.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Billing Cycle',
      accessor: 'billingCycle',
      render: (_: any, record: StreamingTransaction) => (
        <span className="text-gray-600">
          {record.billingCycle.charAt(0).toUpperCase() +
            record.billingCycle.slice(1)}
        </span>
      ),
    },
    {
      header: 'Payment Method',
      accessor: 'paymentMethod',
      render: (_: any, record: StreamingTransaction) => (
        <span className="text-gray-600">
          {getPaymentMethodLabel(record.paymentMethod)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (_: any, record: StreamingTransaction) => (
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
      render: (_: any, record: StreamingTransaction) => (
        <span className="text-gray-600">
          {new Date(record.nextBillingDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      render: (_: any, record: StreamingTransaction) => (
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
      key: 'paymentMethod',
      label: 'Payment Method',
      options: [
        { label: 'All', value: '' },
        { label: 'Credit Card', value: 'card' },
        { label: 'Wallet', value: 'wallet' },
        { label: 'Bank Transfer', value: 'bank_transfer' },
      ],
    },
    {
      key: 'provider',
      label: 'Provider',
      options: [
        { label: 'All', value: '' },
        { label: 'Netflix', value: 'Netflix' },
        { label: 'Disney', value: 'Disney' },
        { label: 'Amazon', value: 'Amazon' },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Streaming Services</h1>
            <p className="text-gray-600 text-sm mt-1">Manage your streaming subscriptions</p>
          </div>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            <Filter className="w-5 h-5" />
            History
          </button>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Payment History Section */}
        {showHistory && (
          <div className="mb-8">
            <SearchableTable
              data={streamingHistory}
              columns={columns}
              filters={filters}
              searchPlaceholder="Search by service name, provider, or reference..."
              title="Streaming Payment History"
              titleIcon={<Filter className="w-5 h-5 mr-2 text-gray-600" />}
              description="View all your streaming service payments"
              actionButton={{
                label: 'Back to Services',
                onClick: () => setShowHistory(false),
                className:
                  'px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors',
              }}
            />
          </div>
        )}

        {/* Payment Form Modal */}
        {showPaymentForm && selectedService && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-8 max-w-md w-full">
              <h2 className="text-xl font-bold text-gray-800 mb-4">
                Subscribe to {selectedService.name}
              </h2>

              <div className="bg-gray-50 rounded-lg p-4 mb-6">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-600">Service</span>
                  <span className="font-semibold text-gray-800">{selectedService.name}</span>
                </div>
                <div className="flex justify-between items-center mb-4">
                  <span className="text-gray-600">Billing Cycle</span>
                  <select
                    value={paymentData.billingCycle}
                    onChange={(e) =>
                      setPaymentData({ ...paymentData, billingCycle: e.target.value })
                    }
                    className="px-3 py-1 border border-gray-200 rounded-lg text-gray-800"
                  >
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly (Save 20%)</option>
                  </select>
                </div>
                <div className="border-t border-gray-200 pt-4">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold text-gray-800">Total</span>
                    <span className="text-2xl font-bold text-gray-800">
                      ${(selectedService.amount * (paymentData.billingCycle === 'yearly' ? 12 * 0.8 : 1)).toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={handleConfirmPayment}
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Confirm Subscription
                </button>
                <button
                  onClick={() => {
                    setShowPaymentForm(false);
                    setSelectedService(null);
                  }}
                  className="w-full px-6 py-3 bg-gray-100 text-gray-700 font-medium rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Active Subscriptions */}
        {activeServices.length > 0 && (
          <div className="mb-12">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Your Active Subscriptions</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {activeServices.map((service) => (
                <div key={service.id} className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="text-4xl mb-3">{service.icon}</div>
                  <h3 className="font-semibold text-gray-800 mb-1">{service.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">${service.amount.toFixed(2)}/month</p>
                  <div className="flex items-center gap-2 text-green-600 text-sm">
                    <CheckCircle className="w-4 h-4" />
                    Active
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Available Services */}
        <div>
          <h2 className="text-lg font-semibold text-gray-800 mb-4">Available Services</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {services.map((service) => (
              <div
                key={service.id}
                className="bg-white rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="text-5xl mb-4">{service.icon}</div>
                  <h3 className="text-xl font-semibold text-gray-800 mb-1">{service.name}</h3>
                  <p className="text-gray-600 text-sm mb-4">{service.provider}</p>

                  <div className="mb-6 pb-6 border-b border-gray-200">
                    <p className="text-3xl font-bold text-gray-800 mb-1">
                      ${service.amount.toFixed(2)}
                    </p>
                    <p className="text-gray-600 text-sm">per month</p>
                  </div>

                  <div className="space-y-3 mb-6">
                    {service.features.map((feature, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-gray-700 text-sm">{feature}</span>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => handleSubscribe(service)}
                    disabled={service.status === 'active'}
                    className={`w-full py-2 rounded-lg font-medium transition-colors flex items-center justify-center gap-2 ${
                      service.status === 'active'
                        ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    <PlayCircle className="w-4 h-4" />
                    {service.status === 'active' ? 'Current Plan' : 'Subscribe Now'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Streaming;
