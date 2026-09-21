import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Filter } from 'lucide-react';
import SearchableTable from '../../../components/general/SearchableTable';
import type { FilterConfig } from '../../../types/general/searchTable';

interface MerchantTransaction {
  id: string;
  merchant: string;
  category: string;
  amount: number;
  fee: number;
  total: number;
  status: 'completed' | 'pending' | 'failed' | 'processing';
  paymentMethod: 'card' | 'bank_transfer' | 'mobile_money' | 'wallet';
  reference: string;
  transactionDate: string;
  }

  interface MerchantHistoryProps {
    onNavigateToPay?: () => void;
    onNavigateToSaved?: () => void;
  }

  const MerchantHistory: React.FC<MerchantHistoryProps> = ({
    onNavigateToPay,
  }) => {
    const navigate = useNavigate();

  // Mock data - Replace with actual API call
  const transactions: MerchantTransaction[] = [
    {
      id: '1',
      merchant: 'Carrefour Supermarket',
      category: 'Retail',
      amount: 5000,
      fee: 75,
      total: 5075,
      status: 'completed',
      paymentMethod: 'card',
      reference: 'MERCH-2025011501001',
      transactionDate: '2025-01-15T14:30:00Z',
    },
    {
      id: '2',
      merchant: 'Tech Hub Kenya',
      category: 'Electronics',
      amount: 15000,
      fee: 225,
      total: 15225,
      status: 'completed',
      paymentMethod: 'bank_transfer',
      reference: 'MERCH-2025011402002',
      transactionDate: '2025-01-14T10:15:00Z',
    },
    {
      id: '3',
      merchant: 'Pizza Hut',
      category: 'Food & Beverage',
      amount: 2500,
      fee: 37.5,
      total: 2537.5,
      status: 'processing',
      paymentMethod: 'mobile_money',
      reference: 'MERCH-2025011301003',
      transactionDate: '2025-01-13T19:45:00Z',
    },
    {
      id: '4',
      merchant: 'Safeway Pharmacy',
      category: 'Healthcare',
      amount: 1200,
      fee: 18,
      total: 1218,
      status: 'completed',
      paymentMethod: 'wallet',
      reference: 'MERCH-2025011201004',
      transactionDate: '2025-01-12T08:20:00Z',
    },
    {
      id: '5',
      merchant: 'Carrefour Supermarket',
      category: 'Retail',
      amount: 3800,
      fee: 57,
      total: 3857,
      status: 'failed',
      paymentMethod: 'card',
      reference: 'MERCH-2025011101005',
      transactionDate: '2025-01-11T12:00:00Z',
    },
    {
      id: '6',
      merchant: 'Tech Hub Kenya',
      category: 'Electronics',
      amount: 8500,
      fee: 127.5,
      total: 8627.5,
      status: 'completed',
      paymentMethod: 'card',
      reference: 'MERCH-2025011001006',
      transactionDate: '2025-01-10T16:30:00Z',
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
      header: 'Merchant',
      accessor: 'merchant',
      render: (_: any, record: MerchantTransaction) => (
        <div>
          <p className="font-medium text-gray-900">{record.merchant}</p>
          <p className="text-xs text-gray-600">{record.category}</p>
        </div>
      ),
    },
    {
      header: 'Amount',
      accessor: 'amount',
      render: (_: any, record: MerchantTransaction) => (
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
      render: (_: any, record: MerchantTransaction) => (
        <span className="font-bold text-gray-900">
          ${record.total.toFixed(2)}
        </span>
      ),
    },
    {
      header: 'Payment Method',
      accessor: 'paymentMethod',
      render: (_: any, record: MerchantTransaction) => (
        <span className="text-gray-600">
          {getPaymentMethodLabel(record.paymentMethod)}
        </span>
      ),
    },
    {
      header: 'Status',
      accessor: 'status',
      render: (_: any, record: MerchantTransaction) => (
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
      accessor: 'transactionDate',
      render: (_: any, record: MerchantTransaction) => (
        <span className="text-gray-600">
          {new Date(record.transactionDate).toLocaleDateString()}
        </span>
      ),
    },
    {
      header: 'Reference',
      accessor: 'reference',
      render: (_: any, record: MerchantTransaction) => (
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
      key: 'category',
      label: 'Category',
      options: [
        { label: 'All', value: '' },
        { label: 'Retail', value: 'Retail' },
        { label: 'Electronics', value: 'Electronics' },
        { label: 'Food & Beverage', value: 'Food & Beverage' },
        { label: 'Healthcare', value: 'Healthcare' },
      ],
    },
  ];

  const actions = [
    {
      label: 'View Details',
      onClick: (record: MerchantTransaction) => {
        console.log('View details:', record);
      },
    },
    {
      label: 'Retry Payment',
      onClick: (record: MerchantTransaction) => {
        if (record.status === 'failed') {
          navigate('/payments/vendors/pay');
        }
      },
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <h1 className="text-2xl font-bold text-gray-800">Merchant Payment History</h1>
          <p className="text-gray-600 mt-1">View and manage your merchant payment transactions</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <SearchableTable
          data={transactions}
          columns={columns}
          actions={actions}
          filters={filters}
          searchPlaceholder="Search by merchant, category, or reference..."
          title="Merchant Transactions"
          titleIcon={<Filter className="w-5 h-5 mr-2 text-gray-600" />}
          description="All your merchant payment history and transaction details"
          actionButton={{
            label: '+ Pay Merchant',
            onClick: () => onNavigateToPay?.(),
            className:
              'px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors',
          }}
        />
      </div>
    </div>
  );
};

export default MerchantHistory;
