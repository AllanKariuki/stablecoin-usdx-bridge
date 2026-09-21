import React from 'react';
import { Download, TrendingUp, Clock, DollarSign, Hash } from 'lucide-react';
import SearchableTable from '../../components/general/SearchableTable';
import { useNavigate } from 'react-router-dom';

interface Deposit {
  id: string;
  date: string;
  reference: string;
  method: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  fees: number;
  netAmount: number;
}

const DepositsHistory: React.FC = () => {
  const navigate = useNavigate();
  const deposits: Deposit[] = [
    {
      id: 'DEP001',
      date: '2025-01-15 14:30',
      reference: 'TRF-2025-001',
      method: 'Bank Transfer',
      amount: 5000,
      currency: 'USD',
      status: 'completed',
      fees: 25,
      netAmount: 4975,
    },
    {
      id: 'DEP002',
      date: '2025-01-14 10:15',
      reference: 'CARD-2025-002',
      method: 'Card Payment',
      amount: 2500,
      currency: 'USD',
      status: 'completed',
      fees: 50,
      netAmount: 2450,
    },
    {
      id: 'DEP003',
      date: '2025-01-13 09:45',
      reference: 'CRYPTO-2025-003',
      method: 'Crypto Transfer',
      amount: 10000,
      currency: 'USD',
      status: 'pending',
      fees: 0,
      netAmount: 10000,
    },
    {
      id: 'DEP004',
      date: '2025-01-12 16:20',
      reference: 'MOBILE-2025-004',
      method: 'Mobile Money',
      amount: 1000,
      currency: 'USD',
      status: 'completed',
      fees: 10,
      netAmount: 990,
    },
    {
      id: 'DEP005',
      date: '2025-01-11 11:30',
      reference: 'TRF-2025-005',
      method: 'Bank Transfer',
      amount: 3000,
      currency: 'USD',
      status: 'failed',
      fees: 15,
      netAmount: 0,
    },
  ];

  const totalDeposits = deposits.reduce((sum, d) => (d.status === 'completed' ? sum + d.amount : sum), 0);
  const totalFees = deposits.reduce((sum, d) => (d.status === 'completed' ? sum + d.fees : sum), 0);
  const pendingCount = deposits.filter((d) => d.status === 'pending').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusLabel = (status: string) => {
    return status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown';
  };

  // Define table columns
  const columns = [
    {
      accessor: 'date',
      title: 'Date & Time',
      sortable: true,
    },
    {
      accessor: 'reference',
      title: 'Reference',
      sortable: true,
      render: (record: Deposit) => (
        <span className="font-medium text-gray-900">{record.reference}</span>
      ),
    },
    {
      accessor: 'method',
      title: 'Method',
      sortable: true,
      render: (record: Deposit) => (
        <span className="text-gray-600">{record.method}</span>
      ),
    },
    {
      accessor: 'amount',
      title: 'Amount',
      sortable: true,
      textAlignment: 'right',
      render: (record: Deposit) => (
        <span className="font-semibold text-gray-900">
          ${record.amount?.toLocaleString() || '0'}
        </span>
      ),
    },
    {
      accessor: 'fees',
      title: 'Fees',
      sortable: true,
      textAlignment: 'right',
      render: (record: Deposit) => (
        <span className="text-gray-600">${record.fees?.toFixed(2) || '0.00'}</span>
      ),
    },
    {
      accessor: 'netAmount',
      title: 'Net Amount',
      sortable: true,
      textAlignment: 'right',
      render: (record: Deposit) => (
        <span className="font-semibold text-gray-900">
          ${record.netAmount?.toLocaleString() || '0'}
        </span>
      ),
    },
    {
      accessor: 'status',
      title: 'Status',
      sortable: true,
      textAlignment: 'center',
      render: (record: Deposit) => (
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(record.status)}`}>
          {getStatusLabel(record.status)}
        </span>
      ),
    },
  ];

  // Define table actions
  const actions = [
    {
      label: 'View',
      onClick: (record: Deposit) => {
        console.log('View deposit:', record);
      },
    },
  ];

  // Define filters
  const filters = [
    {
      key: 'status',
      label: 'Status',
      options: [
        { value: 'all', label: 'All Statuses' },
        { value: 'pending', label: 'Pending' },
        { value: 'completed', label: 'Completed' },
        { value: 'failed', label: 'Failed' },
      ],
      defaultValue: 'all',
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex gap-2 overflow-x-hidden text-sm pl-6">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/dashboard')}
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
      <div className="sticky top-0 z-10">
        <div className="max-w-8xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold text-gray-800">Deposit History</h1>
            <button className="px-4 py-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 flex items-center gap-2 transition-colors">
              <Download className="w-4 h-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-8xl mx-auto px-6 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Deposits</p>
                <p className="text-2xl font-bold text-green-600">${totalDeposits.toLocaleString()}</p>
                <p className="text-xs text-gray-500 mt-1">{deposits.filter(d => d.status === 'completed').length} completed</p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <TrendingUp className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Pending Deposits</p>
                <p className="text-2xl font-bold text-yellow-600">{pendingCount}</p>
                <p className="text-xs text-gray-500 mt-1">{deposits.length > 0 ? Math.round((pendingCount / deposits.length) * 100) : 0}% of total</p>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg">
                <Clock className="h-6 w-6 text-yellow-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Fees</p>
                <p className="text-2xl font-bold text-blue-600">${totalFees.toFixed(2)}</p>
                <p className="text-xs text-gray-500 mt-1">{totalDeposits > 0 ? ((totalFees / totalDeposits) * 100).toFixed(2) : 0}% of deposits</p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <DollarSign className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600">Total Count</p>
                <p className="text-2xl font-bold text-purple-600">{deposits.length}</p>
                <p className="text-xs text-gray-500 mt-1">All transactions</p>
              </div>
              <div className="p-3 bg-purple-100 rounded-lg">
                <Hash className="h-6 w-6 text-purple-600" />
              </div>
            </div>
          </div>
        </div>

        {/* SearchableTable */}
        <SearchableTable
          data={deposits}
          columns={columns}
          actions={actions}
          filters={filters}
          searchPlaceholder="Search by reference or method..."
          highlightOnHover
          recordsPerPageOptions={[5, 10, 25, 50]}
          defaultRecordsPerPage={10}
        />
      </div>
    </div>
  );
};

export default DepositsHistory;
