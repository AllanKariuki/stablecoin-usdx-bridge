import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface AssetRowProps {
  symbol: string;
  name: string;
  amount: string;
  usdValue: string;
  change24h: string;
  isPositive: boolean;
}

const AssetRow: React.FC<AssetRowProps> = ({ 
  symbol, 
  name, 
  amount, 
  usdValue, 
  change24h, 
  isPositive 
}) => {
  return (
    <div className="flex items-center justify-between py-3 px-4 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold">
          {symbol.substring(0, 2)}
        </div>
        <div>
          <div className="font-semibold text-gray-900">{symbol}</div>
          <div className="text-xs text-gray-500">{name}</div>
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold text-gray-900">{amount}</div>
        <div className="text-sm text-gray-600">{usdValue}</div>
      </div>
      <div className={`text-right min-w-[70px] ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        <div className="flex items-center justify-end gap-1 font-semibold text-sm">
          {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
          {change24h}
        </div>
      </div>
    </div>
  );
};

export default AssetRow;
