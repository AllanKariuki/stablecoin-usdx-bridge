/**
 * ConvertHistory Page
 * Transaction history and filtering
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Filter, RefreshCw } from 'lucide-react';
import { HistoryTable } from '../../components/conversion';
import { useConversion } from '../../hooks/useConversion';

/**
 * ConvertHistory - View and filter past conversion transactions
 */
export default function ConvertHistory() {
  const navigate = useNavigate();
  const { transactionHistory, isLoading, refetchHistory } = useConversion();
  const [filter, setFilter] = useState<'all' | 'sent' | 'received'>('all');

  const filteredHistory =
    filter === 'all'
      ? transactionHistory
      : transactionHistory.filter((tx) => tx.direction === filter);

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Exchange History</h1>
            <p className="text-gray-600">View all your currency conversion transactions</p>
          </div>
          <button
            onClick={() => navigate('/convert')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            New Exchange
          </button>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg border border-gray-200 p-4 mb-8">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-600" />
              <span className="text-sm font-medium text-gray-700">Filter:</span>
            </div>

            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              All Transactions
            </button>
            <button
              onClick={() => setFilter('sent')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'sent'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Sent
            </button>
            <button
              onClick={() => setFilter('received')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                filter === 'received'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Received
            </button>

            <div className="flex-1" />

            <button
              onClick={() => refetchHistory()}
              className="flex items-center gap-2 px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* History Table */}
        <HistoryTable
          transactions={filteredHistory}
          isLoading={isLoading}
          onRowClick={(tx) => navigate(`/convert/confirm/${tx.transactionId}`)}
          pagination={{
            limit: 20,
            offset: 0,
            total: transactionHistory.length,
          }}
        />

        {/* Stats Summary */}
        {filteredHistory.length > 0 && (
          <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <p className="text-sm text-gray-600 mb-2">Total Transactions</p>
              <p className="text-3xl font-bold text-gray-900">{filteredHistory.length}</p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <p className="text-sm text-gray-600 mb-2">Completed</p>
              <p className="text-3xl font-bold text-green-600">
                {filteredHistory.filter((tx) => tx.status === 'completed').length}
              </p>
            </div>
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <p className="text-sm text-gray-600 mb-2">Pending/Failed</p>
              <p className="text-3xl font-bold text-yellow-600">
                {filteredHistory.filter(
                  (tx) => tx.status === 'pending' || tx.status === 'failed'
                ).length}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
