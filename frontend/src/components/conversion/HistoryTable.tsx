/**
 * HistoryTable Component
 * Displays transaction history with status indicators using DataTable
 */

import { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, CheckCircle, XCircle, Clock } from 'lucide-react';
import DataTable from '../general/DataTable';
import type { TransactionHistory, TransactionStatus } from '../../types/conversion';

interface HistoryTableProps {
  /** Transaction history data */
  transactions: TransactionHistory[];
  /** Optional CSS class */
  className?: string;
  /** Loading state */
  isLoading?: boolean;
  /** Callback when row is clicked */
  onRowClick?: (transaction: TransactionHistory) => void;
  /** Pagination info */
  pagination?: {
    limit: number;
    offset: number;
    total: number;
  };
  /** Page change handler */
  onPageChange?: (page: number) => void;
  /** Records per page change handler */
  onRecordsPerPageChange?: (recordsPerPage: number) => void;
}

/**
 * Gets status badge color and icon
 */
function getStatusBadge(status: TransactionStatus) {
  switch (status) {
    case 'completed':
      return {
        color: 'bg-green-100 text-green-700',
        icon: <CheckCircle className="w-4 h-4" />,
        label: 'Completed',
      };
    case 'processing':
      return {
        color: 'bg-blue-100 text-blue-700',
        icon: <Clock className="w-4 h-4" />,
        label: 'Processing',
      };
    case 'pending':
      return {
        color: 'bg-yellow-100 text-yellow-700',
        icon: <Clock className="w-4 h-4" />,
        label: 'Pending',
      };
    case 'failed':
    case 'cancelled':
      return {
        color: 'bg-red-100 text-red-700',
        icon: <XCircle className="w-4 h-4" />,
        label: status === 'failed' ? 'Failed' : 'Cancelled',
      };
    default:
      return {
        color: 'bg-gray-100 text-gray-700',
        icon: <Clock className="w-4 h-4" />,
        label: 'Unknown',
      };
  }
}

/**
 * HistoryTable - Displays paginated transaction history using DataTable
 *
 * @example
 * ```tsx
 * <HistoryTable
 *   transactions={history}
 *   isLoading={isLoading}
 *   onRowClick={(tx) => navigate(`/convert/confirm/${tx.transactionId}`)}
 *   pagination={{ limit: 20, offset: 0, total: 100 }}
 * />
 * ```
 */
export function HistoryTable({
  transactions,
  className = '',
  isLoading = false,
  onRowClick,
  pagination,
  onPageChange,
  onRecordsPerPageChange,
}: HistoryTableProps) {
  const [currentPage, setCurrentPage] = useState(1);
  const [recordsPerPage, setRecordsPerPage] = useState(pagination?.limit || 20);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    onPageChange?.(page);
  };

  const handleRecordsPerPageChange = (limit: number) => {
    setRecordsPerPage(limit);
    setCurrentPage(1);
    onRecordsPerPageChange?.(limit);
  };

  // Define columns for DataTable
  const columns = [
    {
      title: 'Type',
      accessor: 'direction',
      render: (_: any, record: TransactionHistory) => (
        <div className="flex items-center gap-2">
          {record.direction === 'sent' ? (
            <ArrowUpRight className="w-5 h-5 text-red-600" />
          ) : (
            <ArrowDownLeft className="w-5 h-5 text-green-600" />
          )}
          <span className="font-medium text-gray-900 capitalize">
            {record.direction}
          </span>
        </div>
      ),
    },
    {
      title: 'From',
      accessor: 'fromCurrency',
      render: (value: string) => (
        <span className="font-semibold text-gray-900">{value}</span>
      ),
    },
    {
      title: 'To',
      accessor: 'toCurrency',
      render: (value: string) => (
        <span className="font-semibold text-gray-900">{value}</span>
      ),
    },
    {
      title: 'Amount',
      accessor: 'fromAmount',
      render: (_: any, record: TransactionHistory) => (
        <div>
          <p className="text-gray-900 font-semibold">
            {record.fromAmount.toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            {record.fromCurrency}
          </p>
          <p className="text-gray-600 text-xs">
            ≈{' '}
            {record.toAmount.toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            {record.toCurrency}
          </p>
        </div>
      ),
    },
    {
      title: 'Status',
      accessor: 'status',
      render: (status: TransactionStatus) => {
        const statusBadge = getStatusBadge(status);
        return (
          <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${statusBadge.color}`}>
            {statusBadge.icon}
            {statusBadge.label}
          </div>
        );
      },
    },
    {
      title: 'Date',
      accessor: 'createdAt',
      render: (value: string) => (
        <div>
          <p className="text-gray-900">
            {new Date(value).toLocaleDateString()}
          </p>
          <p className="text-gray-600 text-xs">
            {new Date(value).toLocaleTimeString()}
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className={className}>
      <DataTable
        records={transactions}
        columns={columns}
        totalRecords={pagination?.total || transactions.length}
        recordsPerPage={recordsPerPage}
        page={currentPage}
        onPageChange={handlePageChange}
        recordsPerPageOptions={[10, 20, 50, 100]}
        onRecordsPerPageChange={handleRecordsPerPageChange}
        highlightOnHover={!!onRowClick}
        loading={isLoading}
        onRowClick={onRowClick}
        paginationText={({ from, to, totalRecords }) =>
          `Showing ${from} to ${to} of ${totalRecords} transactions`
        }
      />
    </div>
  );
}
