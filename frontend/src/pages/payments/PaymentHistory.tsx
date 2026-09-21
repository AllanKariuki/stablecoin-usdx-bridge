import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Filter } from 'lucide-react';
import SearchableTable from '../../components/general/SearchableTable';
import type { FilterConfig } from '../../types/general/searchTable';

interface BillPayment {
  id: string;
  provider: string;
  amount: number;
  fee: number;
  total: number;
  accountNumber: string;
  accountNickname: string;
  status: 'completed' | 'pending' | 'failed' | 'processing';
  paymentMethod: 'card' | 'bank_transfer' | 'mobile_money' | 'wallet';
  reference: string;
  paidAt: string;
  createdAt: string;
}

const PaymentHistory: React.FC = () => {
  const navigate = useNavigate();

  // Mock data - Replace with actual API call
  const billPayments: BillPayment[] = [
    {
      id: '1',
      provider: 'Kenya Power',
      amount: 2500,
      fee: 25,
      total: 2525,
      accountNumber: '12345678',
      accountNickname: 'Home',
      status: 'completed',
      paymentMethod: 'card',
      reference: 'BILL-2025011501001',
      paidAt: '2025-01-15T10:30:00Z',
      createdAt: '2025-01-15T10:30:00Z',
    },
    {
      id: '2',
      provider: 'Nairobi Water',
      amount: 800,
      fee: 8,
      total: 808,
      accountNumber: '87654321',
      accountNickname: 'Main',
      status: 'completed',
      paymentMethod: 'bank_transfer',
      reference: 'BILL-2025011402002',
      paidAt: '2025-01-14T14:15:00Z',
      createdAt: '2025-01-14T14:15:00Z',
    },
    {
      id: '3',
      provider: 'Safaricom Prepaid',
      amount: 500,
      fee: 5,
      total: 505,
      accountNumber: '0712345678',
      accountNickname: 'Primary',
      status: 'completed',
      paymentMethod: 'wallet',
      reference: 'BILL-2025011301003',
      paidAt: '2025-01-13T09:45:00Z',
      createdAt: '2025-01-13T09:45:00Z',
    },
    {
      id: '4',
      provider: 'Zuku Internet',
      amount: 3500,
      fee: 35,
      total: 3535,
      accountNumber: '654987321',
      accountNickname: 'Zuku',
      status: 'processing',
      paymentMethod: 'card',
      reference: 'BILL-2025011201004',
      paidAt: null,
      createdAt: '2025-01-12T11:20:00Z',
    },
    {
      id: '5',
      provider: 'Airtel Mobile',
      amount: 1200,
      fee: 12,
      total: 1212,
      accountNumber: '0798765432',
      accountNickname: 'Work',
      status: 'failed',
      paymentMethod: 'card',
      reference: 'BILL-2025011101005',
      paidAt: null,
      createdAt: '2025-01-11T16:00:00Z',
    },
    {
      id: '6',
      provider: 'Jamii Gas',
      amount: 2000,
      fee: 20,
      total: 2020,
      accountNumber: 'GAS-12345',
      accountNickname: 'Home Gas',
      status: 'completed',
      paymentMethod: 'mobile_money',
      reference: 'BILL-2025011001006',
      paidAt: '2025-01-10T13:30:00Z',
      createdAt: '2025-01-10T13:30:00Z',
    },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'processing':
        return 'bg-blue-100 text-blue-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPaymentMethodLabel = (method: string) => {
    switch (method) {
      case 'card':
        return 'Credit Card';
      case 'bank_transfer':
        return 'Bank Transfer';
      case 'mobile_money':
        return 'Mobile Money';
      case 'wallet':
        return 'Wallet';
      default:
        return method;
    }
  };

  const columns = [
    {
      header: 'Provider',
      accessor: 'provider',
      render: (_: any, record: BillPayment) => (
        <div>
          <p className="font-medium text-gray-900">{record.provider}</p>
          <p className="text-xs text-gray-600">{record.accountNickname}</p>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (_: any, record: BillPayment) => (
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
      render: (_: any, record: BillPayment) => (
        <span className="font-bold text-gray-900">
          ${record.total.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Payment Method',
      accessor: 'paymentMethod',
      render: (_: any, record: BillPayment) => (
        <span className="text-gray-600">
          {getPaymentMethodLabel(record.paymentMethod)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (_: any, record: BillPayment) => (
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
      header: 'Date',
      accessor: 'paidAt',
      render: (_: any, record: BillPayment) => (
        <span className="text-gray-600">
          {new Date(record.paidAt || record.createdAt).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      render: (_: any, record: BillPayment) => (
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
        { label: 'Processing', value: 'processing' },
        { label: 'Pending', value: 'pending' },
        { label: 'Failed', value: 'failed' },
      ],
    },
    {
      key: 'paymentMethod',
      label: 'Payment Method',
      options: [
        { label: 'All', value: '' },
        { label: 'Credit Card', value: 'card' },
        { label: 'Bank Transfer', value: 'bank_transfer' },
        { label: 'Mobile Money', value: 'mobile_money' },
        { label: 'Wallet', value: 'wallet' },
      ],
    },
    {
      key: 'provider',
      label: 'Provider',
      options: [
        { label: 'All', value: '' },
        { label: 'Kenya Power', value: 'Kenya Power' },
        { label: 'Nairobi Water', value: 'Nairobi Water' },
        { label: 'Safaricom Prepaid', value: 'Safaricom Prepaid' },
        { label: 'Airtel Mobile', value: 'Airtel Mobile' },
        { label: 'Zuku Internet', value: 'Zuku Internet' },
        { label: 'Jamii Gas', value: 'Jamii Gas' },
      ],
    },
  ];

  const actions = [
    {
      label: 'View Details',
      onClick: (record: BillPayment) => {
        console.log('View details:', record);
      },
    },
    {
      label: 'Retry Payment',
      onClick: (record: BillPayment) => {
        if (record.status === 'failed') {
          navigate('/payments/bills/electricity', {
            state: {
              selectedProvider: record.provider,
              accountNumber: record.accountNumber,
            },
          });
        }
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">Bill Payment History</h1>
          <p className="text-gray-600 mt-1">View and manage your bill payment transactions</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <SearchableTable
          data={billPayments}
          columns={columns}
          actions={actions}
          filters={filters}
          searchPlaceholder="Search by provider, reference, or account..."
          title="Payment Transactions"
          titleIcon={<Filter className="w-5 h-5 mr-2 text-gray-600" />}
          description="All your bill payment history and transaction details"
          actionButton={{
            label: '+ Pay New Bill',
            onClick: () => navigate('/payments/bills/electricity'),
            className:
              'px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors',
          }}
        />
      </div>
    </div>
  );
};

export default PaymentHistory;
