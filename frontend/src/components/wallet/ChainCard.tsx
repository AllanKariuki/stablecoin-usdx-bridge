import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Download, Upload, Eye, AlertCircle } from 'lucide-react';
import type { Chain, Wallet } from '../../types/wallet/wallet';
import DataTable from '../general/DataTable';

interface ChainCardProps {
  chain: Chain;
  wallets: Wallet[];
  isExpanded: boolean;
  onToggle: () => void;
  onWalletSelect: (wallet: Wallet) => void;
}

const ChainCard: React.FC<ChainCardProps> = ({
  chain,
  wallets,
  isExpanded,
  onToggle,
  onWalletSelect
}) => {
  const [page, setPage] = useState(1);
  const [recordsPerPage] = useState(10);

  const getStatusBadge = (status: string) => {
    const configs: Record<string, { bg: string; text: string; label: string }> = {
      active: { bg: 'bg-green-100', text: 'text-green-700', label: 'Active' },
      frozen: { bg: 'bg-red-100', text: 'text-red-700', label: 'Frozen' },
      'under-review': { bg: 'bg-yellow-100', text: 'text-yellow-700', label: 'Under Review' },
      pending: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Pending' }
    };

    const config = configs[status] || configs.active;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text}`}>
        {config.label}
      </span>
    );
  };

  const getTypeBadge = (type: string) => {
    const configs: Record<string, { bg: string; text: string; icon: string }> = {
      hot: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '🔥' },
      warm: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '☀️' },
      cold: { bg: 'bg-blue-100', text: 'text-blue-700', icon: '❄️' }
    };

    const config = configs[type] || configs.hot;
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.bg} ${config.text} flex items-center gap-1 w-fit`}>
        <span>{config.icon}</span>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </span>
    );
  };

  const columns = [
    {
      title: 'Wallet ID',
      accessor: 'walletId',
      render: (value: string, record: Wallet) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          <div className="text-xs text-gray-500">{record.address}</div>
        </div>
      )
    },
    {
      title: 'Label',
      accessor: 'label',
      render: (value: string, record: Wallet) => (
        <div>
          <div className="font-medium text-gray-900">{value}</div>
          {record.tags && record.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {record.tags.slice(0, 2).map((tag, idx) => (
                <span key={idx} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )
    },
    {
      title: 'Type',
      accessor: 'type',
      render: (value: string) => getTypeBadge(value)
    },
    {
      title: 'Available',
      accessor: 'available',
      render: (value: number, record: Wallet) => (
        <div>
          <div className="font-medium text-gray-900">{value.toFixed(4)} {chain.name.slice(0, 3).toUpperCase()}</div>
          <div className="text-xs text-gray-500">${record.availableUSD.toLocaleString()}</div>
        </div>
      )
    },
    {
      title: 'Reserved',
      accessor: 'reserved',
      render: (value: number, record: Wallet) => (
        <div>
          <div className="font-medium text-gray-900">{value.toFixed(4)} {chain.name.slice(0, 3).toUpperCase()}</div>
          <div className="text-xs text-gray-500">${record.reservedUSD.toLocaleString()}</div>
        </div>
      )
    },
    {
      title: 'Last Sweep',
      accessor: 'lastSweepAt',
      render: (value: string) => value ? (
        <div className="text-sm text-gray-700">
          {new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      ) : (
        <span className="text-gray-400 text-sm">Never</span>
      )
    },
    {
      title: 'Status',
      accessor: 'status',
      render: (value: string) => getStatusBadge(value)
    }
  ];

  const actions = [
    {
      label: 'View Details',
      icon: <Eye className="w-4 h-4" />,
      onClick: (record: Wallet) => onWalletSelect(record)
    },
    {
      label: 'Request Sweep',
      icon: <Upload className="w-4 h-4" />,
      onClick: (record: Wallet) => console.log('Request sweep', record.id),
      hidden: (record: Wallet) => record.status === 'frozen'
    },
    {
      label: 'Export Statement',
      icon: <Download className="w-4 h-4" />,
      onClick: (record: Wallet) => console.log('Export statement', record.id)
    }
  ];

  const handleDeposit = () => {
    console.log('Open deposit modal for', chain.name);
  };

  const handleWithdraw = () => {
    if (!chain.withdrawalEnabled) {
      alert(chain.disabledReason || 'Withdrawals are temporarily disabled for this chain');
      return;
    }
    console.log('Open withdraw modal for', chain.name);
  };

  const handleViewTransactions = () => {
    console.log('View transactions for', chain.name);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Chain Header */}
      <div
        className="p-6 cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-2xl">
              {chain.icon}
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-800">{chain.name}</h3>
              <p className="text-sm text-gray-500">{wallets.length} wallet{wallets.length !== 1 ? 's' : ''}</p>
            </div>
          </div>

          <div className="flex items-center gap-8">
            <div className="text-right">
              <p className="text-sm text-gray-500">Total Balance</p>
              <p className="text-2xl font-bold text-gray-900">
                ${chain.totalBalanceUSD.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-sm text-gray-600">{chain.totalBalance.toFixed(4)} {chain.name.slice(0, 3).toUpperCase()}</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-500">Available</p>
              <p className="text-lg font-semibold text-green-600">{chain.available.toFixed(4)}</p>
            </div>

            <div className="text-right">
              <p className="text-sm text-gray-500">Reserved</p>
              <p className="text-lg font-semibold text-orange-600">{chain.reserved.toFixed(4)}</p>
            </div>

            <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              {isExpanded ? (
                <ChevronUp className="w-5 h-5 text-gray-600" />
              ) : (
                <ChevronDown className="w-5 h-5 text-gray-600" />
              )}
            </button>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-4 flex items-center gap-3">
          <button
            onClick={(e) => { e.stopPropagation(); handleDeposit(); }}
            disabled={!chain.depositEnabled}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
          >
            <Download className="w-4 h-4" />
            Deposit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleWithdraw(); }}
            disabled={!chain.withdrawalEnabled}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
          >
            <Upload className="w-4 h-4" />
            Withdraw
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleViewTransactions(); }}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center gap-2 text-sm"
          >
            <Eye className="w-4 h-4" />
            View Transactions
          </button>

          {!chain.withdrawalEnabled && chain.disabledReason && (
            <div className="flex items-center gap-2 ml-auto text-yellow-700 bg-yellow-50 px-3 py-2 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">{chain.disabledReason}</span>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Wallet Table */}
      {isExpanded && wallets.length > 0 && (
        <div className="border-t border-gray-200 p-6">
          <DataTable
            records={wallets}
            columns={columns}
            totalRecords={wallets.length}
            recordsPerPage={recordsPerPage}
            page={page}
            onPageChange={setPage}
            highlightOnHover={true}
            actions={actions}
            onRowClick={(wallet) => onWalletSelect(wallet)}
          />
        </div>
      )}

      {isExpanded && wallets.length === 0 && (
        <div className="border-t border-gray-200 p-12 text-center">
          <p className="text-gray-500">No wallets found for this chain</p>
          <button className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Create Wallet
          </button>
        </div>
      )}
    </div>
  );
};

export default ChainCard;
