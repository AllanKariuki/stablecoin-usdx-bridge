import React, { useState, useEffect } from 'react';
import { X, Copy, Download, Upload, Snowflake, Tag, AlertCircle, TrendingUp, TrendingDown, ExternalLink, FileText } from 'lucide-react';
import type { Wallet, WalletTransaction, WalletDetailStats, SweepHistory } from '../../types/wallet/wallet';
import DataTable from '../general/DataTable';

interface WalletDetailDrawerProps {
  wallet: Wallet;
  onClose: () => void;
}

const WalletDetailDrawer: React.FC<WalletDetailDrawerProps> = ({ wallet, onClose }) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'transactions' | 'sweeps'>('overview');
  const [showSweepModal, setShowSweepModal] = useState(false);
  const [showLabelModal, setShowLabelModal] = useState(false);
  const [page, setPage] = useState(1);
  const [recordsPerPage] = useState(10);

  // Mock data - replace with API calls
  const [stats] = useState<WalletDetailStats>({
    totalInflow: 1250.75,
    totalOutflow: 845.50,
    totalInflowUSD: 2251350.00,
    totalOutflowUSD: 1521900.00,
    transactionCount: 347,
    lastActivityAt: '2025-01-12T16:45:00Z',
    averageTransactionSize: 3.6
  });

  const [transactions] = useState<WalletTransaction[]>([
    {
      id: '1',
      txHash: '0xabc123...def456',
      type: 'deposit',
      amount: 5.5,
      amountUSD: 9900.00,
      fee: 0.002,
      status: 'confirmed',
      timestamp: '2025-01-12T16:45:00Z',
      confirmations: 24,
      fromAddress: '0x123...789',
      toAddress: wallet.address
    },
    {
      id: '2',
      txHash: '0xdef789...ghi012',
      type: 'withdrawal',
      amount: 2.3,
      amountUSD: 4140.00,
      fee: 0.003,
      status: 'pending',
      timestamp: '2025-01-12T14:20:00Z',
      confirmations: 8,
      fromAddress: wallet.address,
      toAddress: '0x456...012'
    },
    {
      id: '3',
      txHash: '0xghi345...jkl678',
      type: 'sweep',
      amount: 10.0,
      amountUSD: 18000.00,
      fee: 0.005,
      status: 'confirmed',
      timestamp: '2025-01-10T14:30:00Z',
      confirmations: 156,
      fromAddress: wallet.address,
      toAddress: '0x789...345'
    }
  ]);

  const [sweepHistory] = useState<SweepHistory[]>([
    {
      id: '1',
      walletId: wallet.id,
      amount: 10.0,
      amountUSD: 18000.00,
      timestamp: '2025-01-10T14:30:00Z',
      txHash: '0xghi345...jkl678',
      status: 'completed',
      fee: 0.005,
      destinationAddress: '0x789...345'
    },
    {
      id: '2',
      walletId: wallet.id,
      amount: 15.5,
      amountUSD: 27900.00,
      timestamp: '2024-12-20T08:15:00Z',
      txHash: '0xmno901...pqr234',
      status: 'completed',
      fee: 0.007,
      destinationAddress: '0x234...901'
    }
  ]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // Could add a toast notification here
  };

  const handleSweepRequest = () => {
    setShowSweepModal(true);
  };

  const handleFreezeWallet = () => {
    if (window.confirm('Are you sure you want to freeze this wallet? All operations will be disabled.')) {
      console.log('Freeze wallet', wallet.id);
    }
  };

  const handleExportStatement = () => {
    console.log('Export statement for wallet', wallet.id);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      confirmed: 'text-green-600',
      pending: 'text-yellow-600',
      failed: 'text-red-600'
    };
    return colors[status] || 'text-gray-600';
  };

  const getTypeIcon = (type: string) => {
    const icons: Record<string, JSX.Element> = {
      deposit: <Download className="w-4 h-4 text-green-600" />,
      withdrawal: <Upload className="w-4 h-4 text-blue-600" />,
      sweep: <TrendingUp className="w-4 h-4 text-purple-600" />,
      internal: <TrendingDown className="w-4 h-4 text-gray-600" />
    };
    return icons[type] || icons.internal;
  };

  const transactionColumns = [
    {
      title: 'Type',
      accessor: 'type',
      render: (value: string) => (
        <div className="flex items-center gap-2">
          {getTypeIcon(value)}
          <span className="capitalize">{value}</span>
        </div>
      )
    },
    {
      title: 'Amount',
      accessor: 'amount',
      render: (value: number, record: WalletTransaction) => (
        <div>
          <div className="font-medium">{value.toFixed(4)} ETH</div>
          <div className="text-xs text-gray-500">${record.amountUSD.toLocaleString()}</div>
        </div>
      )
    },
    {
      title: 'Status',
      accessor: 'status',
      render: (value: string, record: WalletTransaction) => (
        <div>
          <div className={`font-medium capitalize ${getStatusColor(value)}`}>{value}</div>
          <div className="text-xs text-gray-500">{record.confirmations} confirmations</div>
        </div>
      )
    },
    {
      title: 'Date',
      accessor: 'timestamp',
      render: (value: string) => (
        <div className="text-sm">
          {new Date(value).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      )
    },
    {
      title: 'Tx Hash',
      accessor: 'txHash',
      render: (value: string) => (
        <div className="flex items-center gap-2">
          <span className="text-blue-600 hover:underline cursor-pointer">{value}</span>
          <ExternalLink className="w-3 h-3 text-gray-400" />
        </div>
      )
    }
  ];

  const sweepColumns = [
    {
      title: 'Amount',
      accessor: 'amount',
      render: (value: number, record: SweepHistory) => (
        <div>
          <div className="font-medium">{value.toFixed(4)} ETH</div>
          <div className="text-xs text-gray-500">${record.amountUSD.toLocaleString()}</div>
        </div>
      )
    },
    {
      title: 'Destination',
      accessor: 'destinationAddress',
      render: (value: string) => (
        <span className="text-sm font-mono">{value}</span>
      )
    },
    {
      title: 'Fee',
      accessor: 'fee',
      render: (value: number) => (
        <span className="text-sm">{value.toFixed(6)} ETH</span>
      )
    },
    {
      title: 'Status',
      accessor: 'status',
      render: (value: string) => (
        <span className={`capitalize ${getStatusColor(value)}`}>{value}</span>
      )
    },
    {
      title: 'Date',
      accessor: 'timestamp',
      render: (value: string) => (
        <div className="text-sm">
          {new Date(value).toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
          })}
        </div>
      )
    }
  ];

  return (
    <>
      {/* Overlay */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-40"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="fixed right-0 top-0 h-full w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-800">Wallet Details</h2>
            <p className="text-sm text-gray-500">{wallet.walletId}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-600" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Wallet Info Card */}
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-6 mb-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-1">{wallet.label}</h3>
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm text-gray-600 font-mono">{wallet.address}</span>
                  <button
                    onClick={() => copyToClipboard(wallet.address)}
                    className="p-1 hover:bg-blue-200 rounded transition-colors"
                  >
                    <Copy className="w-4 h-4 text-blue-600" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {wallet.tags?.map((tag, idx) => (
                    <span key={idx} className="px-2 py-1 bg-blue-200 text-blue-800 text-xs rounded-full">
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                  wallet.type === 'hot' ? 'bg-orange-100 text-orange-700' :
                  wallet.type === 'warm' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-blue-100 text-blue-700'
                }`}>
                  {wallet.type.toUpperCase()}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600 mb-1">Available Balance</p>
                <p className="text-2xl font-bold text-gray-900">{wallet.available.toFixed(4)}</p>
                <p className="text-sm text-gray-600">${wallet.availableUSD.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-sm text-gray-600 mb-1">Reserved</p>
                <p className="text-2xl font-bold text-orange-600">{wallet.reserved.toFixed(4)}</p>
                <p className="text-sm text-gray-600">${wallet.reservedUSD.toLocaleString()}</p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="grid grid-cols-2 gap-3 mb-6">
            <button
              onClick={handleSweepRequest}
              disabled={wallet.status === 'frozen'}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Upload className="w-4 h-4" />
              Request Sweep
            </button>
            <button
              onClick={() => setShowLabelModal(true)}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
            >
              <Tag className="w-4 h-4" />
              Edit Label
            </button>
            <button
              onClick={handleFreezeWallet}
              disabled={wallet.status === 'frozen'}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <Snowflake className="w-4 h-4" />
              {wallet.status === 'frozen' ? 'Frozen' : 'Freeze Wallet'}
            </button>
            <button
              onClick={handleExportStatement}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Export Statement
            </button>
          </div>

          {/* Status Warnings */}
          {wallet.status === 'under-review' && (
            <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-800">Wallet Under Review</p>
                <p className="text-sm text-yellow-700 mt-1">
                  This wallet is currently under review. Some operations may be restricted.
                </p>
              </div>
            </div>
          )}

          {/* Analytics */}
          <div className="mb-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Analytics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <p className="text-sm text-gray-600">Total Inflow</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.totalInflow.toFixed(4)}</p>
                <p className="text-sm text-gray-600">${stats.totalInflowUSD.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <p className="text-sm text-gray-600">Total Outflow</p>
                </div>
                <p className="text-xl font-bold text-gray-900">{stats.totalOutflow.toFixed(4)}</p>
                <p className="text-sm text-gray-600">${stats.totalOutflowUSD.toLocaleString()}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Total Transactions</p>
                <p className="text-xl font-bold text-gray-900">{stats.transactionCount}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-1">Avg. Transaction Size</p>
                <p className="text-xl font-bold text-gray-900">{stats.averageTransactionSize.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-gray-200 mb-6">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('overview')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('transactions')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'transactions'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                Transactions ({transactions.length})
              </button>
              <button
                onClick={() => setActiveTab('sweeps')}
                className={`pb-3 border-b-2 transition-colors ${
                  activeTab === 'sweeps'
                    ? 'border-blue-600 text-blue-600 font-medium'
                    : 'border-transparent text-gray-600 hover:text-gray-800'
                }`}
              >
                Sweep History ({sweepHistory.length})
              </button>
            </div>
          </div>

          {/* Tab Content */}
          {activeTab === 'overview' && (
            <div>
              <h4 className="font-semibold text-gray-800 mb-3">Wallet Information</h4>
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Custody Type</span>
                  <span className="font-medium capitalize">{wallet.custodyType}</span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Created</span>
                  <span className="font-medium">
                    {new Date(wallet.createdAt).toLocaleDateString('en-US', {
                      month: 'long',
                      day: 'numeric',
                      year: 'numeric'
                    })}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Last Activity</span>
                  <span className="font-medium">
                    {new Date(stats.lastActivityAt).toLocaleDateString('en-US', {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex justify-between py-2 border-b border-gray-100">
                  <span className="text-gray-600">Last Sweep</span>
                  <span className="font-medium">
                    {wallet.lastSweepAt
                      ? new Date(wallet.lastSweepAt).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric'
                        })
                      : 'Never'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'transactions' && (
            <div>
              <DataTable
                records={transactions}
                columns={transactionColumns}
                totalRecords={transactions.length}
                recordsPerPage={recordsPerPage}
                page={page}
                onPageChange={setPage}
                highlightOnHover={true}
              />
            </div>
          )}

          {activeTab === 'sweeps' && (
            <div>
              {sweepHistory.length > 0 ? (
                <DataTable
                  records={sweepHistory}
                  columns={sweepColumns}
                  totalRecords={sweepHistory.length}
                  recordsPerPage={recordsPerPage}
                  page={page}
                  onPageChange={setPage}
                  highlightOnHover={true}
                />
              ) : (
                <div className="text-center py-12 text-gray-500">
                  <p>No sweep history available</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default WalletDetailDrawer;
