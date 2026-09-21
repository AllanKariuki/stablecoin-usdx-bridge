import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';

interface TradingActivityProps {
  name: string;
  time: string;
  amount: string;
  status: 'Completed' | 'Pending' | 'Cancelled';
  type: 'buy' | 'sell';
}

const TradingActivity: React.FC<TradingActivityProps> = ({ name, time, amount, status, type }) => {
  const isPositive = type === 'buy';
  
  return (
    <div className="py-3 border-b border-gray-100 last:border-0">
      <div className="w-full grid grid-cols-5 gap-3">
        <div className={`w-10 h-10 ${isPositive ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center`}>
          {isPositive ? (
            <ArrowUpRight className="w-5 h-5 text-green-600" />
          ) : (
            <ArrowDownRight className="w-5 h-5 text-red-600" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-800">{name}</span>
            <span className="text-xl">
              {name.toLowerCase().includes('bitcoin') ? '₿' : 
               name.toLowerCase().includes('ethereum') ? 'Ξ' :
               name.toLowerCase().includes('monero') ? 'Ɱ' : 
               name.toLowerCase().includes('litcoin') || name.toLowerCase().includes('litecoin') ? 'Ł' : '●'}
            </span>
          </div>
        </div>
        <div className="">
             <p className="text-xs text-gray-500">{time}</p>
        </div>
        <div className="text-left">
            <p className={`font-semibold ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                {amount}
            </p>
        </div>
        <div className="text-left">
            <span className={`text-xs px-2 py-1 rounded-full ${
                status === 'Completed' ? 'bg-green-100 border border-green-400 text-green-700' :
                status === 'Pending' ? 'bg-gray-100 border border-gray-200 text-gray-700' :
                'bg-red-100 border border-red-200 text-red-700'
                }`}>
                {status}
            </span>
        </div>
      </div>
    </div>
  );
};

export default TradingActivity;
