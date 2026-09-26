import React, { useEffect } from 'react';
import SearchableTable from '../../components/general/SearchableTable';
import { CalendarSearch } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from '../../redux/hooks';
import { fetchTransactions, selectTransactions, selectTransactionsError, selectTransactionsLoading } from '../../redux/slices/transactions/transactionsSlice';
import { fetchWallets, selectWallets } from '../../redux/slices/wallet/walletSlice';
import { primaryEntryFor, type Transaction } from '../../types/transactions/dampTransaction';

/**
 * core-ledger's real transaction taxonomy (core-ledger/internal/ledger/models.go)
 * — replaces the old fake PaymentStatus/TransactionType unions from a
 * different product's mock data, which this table never actually rendered
 * against real values.
 */
const STATUS_OPTIONS = [
  { value: 'all', label: 'All Statuses' },
  { value: 'POSTED', label: 'Posted' },
  { value: 'REVERSED', label: 'Reversed' },
];

const TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'FIAT_DEPOSIT', label: 'Deposit' },
  { value: 'FIAT_WITHDRAWAL', label: 'Withdrawal' },
  { value: 'USDX_ISSUE', label: 'USD-X Issue' },
  { value: 'USDX_REDEEM', label: 'USD-X Redeem' },
  { value: 'FX_CONVERSION', label: 'FX Conversion' },
  { value: 'INTERNAL_TRANSFER', label: 'Internal Transfer' },
  { value: 'CHAIN_BRIDGE_OUT', label: 'Bridge Out' },
  { value: 'CHAIN_BRIDGE_IN', label: 'Bridge In' },
  { value: 'FEE', label: 'Fee' },
  { value: 'REVERSAL', label: 'Reversal' },
];

const TransactionsList: React.FC = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const transactions = useAppSelector(selectTransactions);
  const loading = useAppSelector(selectTransactionsLoading);
  const error = useAppSelector(selectTransactionsError);
  const wallets = useAppSelector(selectWallets);
  const ownWalletIds = new Set(wallets.map((w) => w.id));

  useEffect(() => {
    dispatch(fetchTransactions({ limit: 50 }));
    dispatch(fetchWallets());
  }, [dispatch]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'POSTED':
        return 'text-green-600 bg-green-50';
      case 'REVERSED':
        return 'text-red-600 bg-red-50';
      default:
        return 'text-gray-600 bg-gray-50';
    }
  };

  const columns = [
    {
      accessor: 'id',
      title: 'Transaction ID',
      sortable: true,
      render: (_: unknown, record: Transaction) => (
        <span className="text-sm font-medium text-gray-900">{record.id}</span>
      ),
    },
    {
      accessor: 'type',
      title: 'Type',
      sortable: true,
      render: (_: unknown, record: Transaction) => (
        <span className="text-sm text-gray-700">{record.type}</span>
      ),
    },
    {
      accessor: 'valueDate',
      title: 'Date',
      sortable: true,
      render: (_: unknown, record: Transaction) => (
        <span className="text-sm text-gray-700">{new Date(record.valueDate).toLocaleString()}</span>
      ),
    },
    {
      accessor: 'amount',
      title: 'Amount',
      sortable: true,
      textAlignment: 'right',
      render: (_: unknown, record: Transaction) => {
        const entry = primaryEntryFor(record, ownWalletIds);
        return (
          <span className={`text-sm font-semibold ${entry.direction === 'DEBIT' ? 'text-red-600' : 'text-green-600'}`}>
            {entry.amount.display}
          </span>
        );
      },
    },
    {
      accessor: 'description',
      title: 'Note',
      render: (_: unknown, record: Transaction) => (
        <span className="text-sm text-gray-500 truncate max-w-xs block">{record.description}</span>
      ),
    },
    {
      accessor: 'status',
      title: 'Status',
      sortable: true,
      textAlignment: 'center',
      render: (_: unknown, record: Transaction) => (
        <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase ${getStatusColor(record.status)}`}>
          {record.status}
        </span>
      ),
    },
  ];

  const filters = [
    { key: 'status', label: 'Status', options: STATUS_OPTIONS, defaultValue: 'all' },
    { key: 'type', label: 'Type', options: TYPE_OPTIONS, defaultValue: 'all' },
  ];

  return (
    <div className="">
      <div className="flex gap-2 overflow-x-hidden text-sm pl-6">
        <button className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors" onClick={() => navigate('/dashboard')}>
          Home
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">Transaction History</span>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-bold text-gray-900">Transactions List</h1>
          <div className="flex items-center gap-3">
            <button className="px-4 py-3 bg-blue-600 text-white text-sm rounded-3xl hover:bg-blue-700 flex items-center gap-2">
              <CalendarSearch className="w-4 h-4" />
              Filter Periods
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      </div>

      <div className="flex-1 p-6">
        {loading && transactions.length === 0 ? (
          <p className="text-sm text-gray-500">Loading transactions…</p>
        ) : (
          <SearchableTable
            data={transactions}
            columns={columns}
            filters={filters}
            searchPlaceholder="Search by transaction id or description..."
            highlightOnHover
            recordsPerPageOptions={[5, 10, 25, 50]}
            defaultRecordsPerPage={10}
          />
        )}
      </div>
    </div>
  );
};

export default TransactionsList;
