import React from 'react';
import { Download, Upload, RefreshCw, ExternalLink, CheckCircle, Clock, XCircle } from 'lucide-react';

interface TransactionRowProps {
  id: string;
  type: 'deposit' | 'withdraw' | 'trade' | 'convert';
  asset: string;
  amount: string;
  status: 'completed' | 'pending' | 'failed';
  time: string;
  txHash?: string;
}

const TransactionRow: React.FC<TransactionRowProps> = ({ 
  type, 
  asset, 
  amount, 
  status, 
  time, 
  txHash 
}) => {
  const typeConfig = {
    deposit: { icon: Download, color: 'text-green-600', bg: 'bg-green-100', label: 'Deposit' },
    withdraw: { icon: Upload, color: 'text-red-600', bg: 'bg-red-100', label: 'Withdraw' },
    trade: { icon: RefreshCw, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Trade' },
    convert: { icon: RefreshCw, color: 'text-purple-600', bg: 'bg-purple-100', label: 'Convert' }
  };

  const statusConfig = {
    completed: { icon: CheckCircle, color: 'text-green-600', label: 'Completed' },
    pending: { icon: Clock, color: 'text-yellow-600', label: 'Pending' },
    failed: { icon: XCircle, color: 'text-red-600', label: 'Failed' }
  };

  const StatusIcon = statusConfig[status].icon;

  const TypeIcon = typeConfig[type].icon;
  const isPositive = type !== 'withdraw';

  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="w-full grid grid-cols-5 gap-3">
        <div className={`w-10 h-10 ${typeConfig[type].bg} rounded-full flex items-center justify-center`}>
          <TypeIcon className={`w-5 h-5 ${typeConfig[type].color}`} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{typeConfig[type].label}</span>
            <span className="text-xs text-gray-600">{asset}</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-gray-500">{time}</p>
          {txHash && (
            <a href="#" className="flex items-center gap-1 text-blue-600 hover:underline text-xs">
              <ExternalLink className="w-3 h-3" />
              View
            </a>
          )}
        </div>
        <div className="text-left">
          <p className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? '+' : '-'}{amount}
          </p>
        </div>
        <div className="text-left">
          <span className={`text-xs flex items-center gap-1 space-between px-2 py-1 rounded-full ${
            status === 'completed' ? 'bg-green-100 border border-green-400 text-green-700' :
            status === 'pending' ? 'bg-gray-100 border border-gray-200 text-gray-700' :
            'bg-red-100 border border-red-200 text-red-700'
          }`}>
            <StatusIcon className="w-3 h-3" />
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default TransactionRow;
