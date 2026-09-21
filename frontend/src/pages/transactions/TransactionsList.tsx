import React from 'react';
import SearchableTable from '../../components/general/SearchableTable';
import moment from 'moment';
import type { TransactionHistory, TransactionType, PaymentStatus } from '../../types/financial';
import { ArrowDownRight, ArrowLeft, ArrowRight, ArrowUpLeft, CalendarSearch, ReceiptText, RefreshCw, Repeat } from 'lucide-react';
import { mockTransactions } from '../../types/transactions/transactions';
import { useNavigate } from 'react-router-dom';

const TransactionsList: React.FC = () => {
  const navigate = useNavigate();
  const getStatusColor = (status: PaymentStatus | undefined) => {
    if (!status) return 'text-gray-600 bg-gray-50';
    const statusMap: Record<PaymentStatus, string> = {
      COMPLETED: 'text-green-600 bg-green-50',
      PENDING: 'text-yellow-600 bg-yellow-50',
      FAILED: 'text-red-600 bg-red-50',
      CANCELLED: 'text-red-600 bg-red-50',
      PROCESSING: 'text-blue-600 bg-blue-50',
      REFUNDED: 'text-purple-600 bg-purple-50',
    };
    return statusMap[status] || 'text-gray-600 bg-gray-50';
  };

  const getTypeIcon = (type: TransactionType) => {
    const iconMap: Record<TransactionType, React.ReactNode> = {
      deposit: <ArrowDownRight className='' />,
      withdrawal: <ArrowUpLeft className='' />,
      payment_sent: <ArrowLeft className='' />,
      payment_received: <ArrowRight className='' />,
      transfer: <Repeat className='' />,
      bill_payment: <ReceiptText className='' />,
      conversion: <RefreshCw />,
    };
    return iconMap[type] || '•';
  };

  // Define table columns
  const columns = [
    {
      accessor: 'reference',
      title: 'Transaction ID',
      sortable: true,
      render: (_: any, record: TransactionHistory) => (
        <div className="flex items-center gap-3">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-white ${
              record.status?.toUpperCase() === 'COMPLETED'
                ? 'bg-green-500'
                : record.status?.toUpperCase() === 'FAILED'
                  ? 'bg-red-500'
                  : 'bg-yellow-500'
            }`}
          >
            {getTypeIcon(record.type)}
          </div>
          <span className="text-sm font-medium text-gray-900">{record.reference}</span>
        </div>
      ),
    },
    {
      accessor: 'createdAt',
      title: 'Date',
      sortable: true,
      render: (_: any, record: TransactionHistory) => (
        <span className="text-sm text-gray-700">
          {moment(new Date(record.createdAt)).format('MMM dd, yyyy  HH:mm')}
        </span>
      ),
    },
    {
      accessor: 'counterpartyName',
      title: 'From',
      render: (_: any, record: TransactionHistory) => (
        <span className="text-sm text-gray-700">{record.counterpartyName || 'N/A'}</span>
      ),
    },
    {
      accessor: 'counterpartyName',
      title: 'To',
      render: (_: any, record: TransactionHistory) => (
        <span className="text-sm text-gray-700">{record.counterpartyName || 'N/A'}</span>
      ),
    },
    {
      accessor: 'currency',
      title: 'Coin',
      render: (_: any, record: TransactionHistory) => (
        <span className="inline-flex items-center gap-1 text-sm font-medium text-gray-900">
          <span className="text-lg">{getTypeIcon(record.type)}</span>
          {record.currency}
        </span>
      ),
    },
    {
      accessor: 'amount',
      title: 'Amount',
      sortable: true,
      textAlignment: 'right',
      render: (_: any, record: TransactionHistory) => (
        <span
          className={`text-sm font-semibold ${
            record.type === 'payment_sent' || record.type === 'withdrawal'
              ? 'text-red-600'
              : 'text-green-600'
          }`}
        >
          {record.type === 'payment_sent' || record.type === 'withdrawal' ? '-' : '+'}
          {record.amount?.toFixed(3) || '0.000'}
        </span>
      ),
    },
    {
      accessor: 'description',
      title: 'Note',
      render: (_: any, record: TransactionHistory) => (
        <span className="text-sm text-gray-500 truncate max-w-xs block">
          {record.description}
        </span>
      ),
    },
    {
      accessor: 'status',
      title: 'Status',
      sortable: true,
      textAlignment: 'center',
      render: (_: any, record: TransactionHistory) => (
        <span
          className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(
            record.status?.toUpperCase() as PaymentStatus
          )}`}
        >
          {record.status || 'Unknown'}
        </span>
      ),
    },
  ];

  // Define filters
  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'all', label: 'All Statuses' },
        { value: 'completed', label: 'Completed' },
        { value: 'pending', label: 'Pending' },
        { value: 'failed', label: 'Failed' },
        { value: 'cancelled', label: 'Cancelled' },
        { value: 'processing', label: 'Processing' },
        { value: 'refunded', label: 'Refunded' },
      ],
      defaultValue: 'all',
    },
    {
      key: 'type',
      label: 'Type',
      options: [
        { value: 'all', label: 'All Types' },
        { value: 'deposit', label: 'Deposit' },
        { value: 'withdrawal', label: 'Withdrawal' },
        { value: 'payment_sent', label: 'Payment Sent' },
        { value: 'payment_received', label: 'Payment Received' },
        { value: 'transfer', label: 'Transfer' },
        { value: 'bill_payment', label: 'Bill Payment' },
        { value: 'conversion', label: 'Conversion' },
      ],
      defaultValue: 'all',
    },
  ];

  return (
    <div className="">
      <div className="flex gap-2 overflow-x-hidden text-sm pl-6">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/live-map')}
        >
          Home
        </button>
        <span className="text-gray-400">/</span>
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
        >
          Transactions
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
          Transaction History
        </span>
      </div>

      {/* Header */}
      <div className="p-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Transactions List</h1>
          <div className="flex items-center gap-3">
            {/* <div className="text-sm text-gray-600">Medium, IDN</div> */}
            <button className="px-4 py-3 bg-blue-600 text-white text-sm rounded-3xl hover:bg-blue-700 flex items-center gap-2">
              <CalendarSearch className='w-4 h-4 ' />
              Filter Periods
            </button>
          </div>
        </div>
      </div>

      {/* SearchableTable */}
      <div className="flex-1 p-6">
        <SearchableTable
          data={mockTransactions}
          columns={columns}
          filters={filters}
          searchPlaceholder="Search by reference, counterparty, or description..."
          highlightOnHover
          recordsPerPageOptions={[5, 10, 25, 50]}
          defaultRecordsPerPage={10}
        />
      </div>
    </div>
  );
};

export default TransactionsList;
