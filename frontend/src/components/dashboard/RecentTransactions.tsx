import React from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowDownRight, 
  ArrowUpLeft, 
  ArrowLeft, 
  ArrowRight, 
  Repeat, 
  ReceiptText, 
  RefreshCw,
  ExternalLink 
} from 'lucide-react';
import moment from 'moment';
import type { TransactionHistory, TransactionType } from '../../types/financial';

interface RecentTransactionsProps {
  transactions: TransactionHistory[];
  limit?: number;
}

const RecentTransactions: React.FC<RecentTransactionsProps> = ({ transactions, limit = 6 }) => {
  const navigate = useNavigate();

  const getTypeIcon = (type: TransactionType) => {
    const iconMap: Record<TransactionType, React.ReactNode> = {
      deposit: <ArrowDownRight className="w-5 h-5" />,
      withdrawal: <ArrowUpLeft className="w-5 h-5" />,
      payment_sent: <ArrowLeft className="w-5 h-5" />,
      payment_received: <ArrowRight className="w-5 h-5" />,
      transfer: <Repeat className="w-5 h-5" />,
      bill_payment: <ReceiptText className="w-5 h-5" />,
      conversion: <RefreshCw className="w-5 h-5" />,
    };
    return iconMap[type] || <Repeat className="w-5 h-5" />;
  };

  const getTypeColor = (type: TransactionType) => {
    const colorMap: Record<TransactionType, string> = {
      deposit: 'bg-green-100 text-green-600',
      withdrawal: 'bg-red-100 text-red-600',
      payment_sent: 'bg-orange-100 text-orange-600',
      payment_received: 'bg-blue-100 text-blue-600',
      transfer: 'bg-purple-100 text-purple-600',
      bill_payment: 'bg-yellow-100 text-yellow-600',
      conversion: 'bg-indigo-100 text-indigo-600',
    };
    return colorMap[type] || 'bg-gray-100 text-gray-600';
  };

  const getStatusColor = (status: string) => {
    const statusMap: Record<string, string> = {
      COMPLETED: 'bg-green-50 text-green-700 border-green-200',
      PENDING: 'bg-yellow-50 text-yellow-700 border-yellow-200',
      FAILED: 'bg-red-50 text-red-700 border-red-200',
      CANCELLED: 'bg-gray-50 text-gray-700 border-gray-200',
      PROCESSING: 'bg-blue-50 text-blue-700 border-blue-200',
    };
    return statusMap[status.toUpperCase()] || 'bg-gray-50 text-gray-700 border-gray-200';
  };

  const displayedTransactions = transactions.slice(0, limit);

  return (
    <div className="bg-white rounded-xl p-6 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-bold text-gray-800">Recent Transactions</h2>
          <p className="text-sm text-gray-500">Your latest account activity</p>
        </div>
        <button 
          onClick={() => navigate('/transactions/history')}
          className="text-sm font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          View All <ExternalLink className="w-3 h-3" />
        </button>
      </div>
      
      <div className="space-y-1">
        {displayedTransactions.map((transaction) => (
          <div 
            key={transaction.reference} 
            className="py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 rounded-lg px-2 transition-colors"
          >
            <div className="grid grid-cols-5 gap-3 items-center">
              {/* Icon & Type */}
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${getTypeColor(transaction.type)}`}>
                  {getTypeIcon(transaction.type)}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800 capitalize">
                    {transaction.type.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {moment(transaction.createdAt).format('MMM DD, HH:mm')}
                  </p>
                </div>
              </div>

              {/* Counterparty */}
              <div>
                <p className="text-sm text-gray-700">
                  {transaction.counterpartyName || 'N/A'}
                </p>
              </div>

              {/* Currency */}
              <div>
                <span className="text-sm font-medium text-gray-900">
                  {transaction.currency}
                </span>
              </div>

              {/* Amount */}
              <div className="text-right">
                <p className={`font-semibold text-sm ${
                  transaction.type === 'payment_sent' || transaction.type === 'withdrawal'
                    ? 'text-red-600'
                    : 'text-green-600'
                }`}>
                  {transaction.type === 'payment_sent' || transaction.type === 'withdrawal' ? '-' : '+'}
                  {transaction.amount?.toFixed(2) || '0.00'}
                </p>
              </div>

              {/* Status */}
              <div className="text-right">
                <span className={`text-xs px-2 py-1 rounded-full border ${getStatusColor(transaction.status || 'PENDING')}`}>
                  {transaction.status || 'Pending'}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentTransactions;
