import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface KPICardProps {
  label: string;
  value: string;
  delta?: string;
  deltaPercent?: string;
  isPositive?: boolean;
  sparklineData?: number[];
  icon?: string;
}

const KPICard: React.FC<KPICardProps> = ({ 
  label, 
  value, 
  delta, 
  deltaPercent, 
  isPositive = true,
  icon = '💰'
}) => {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 py-5">
        <div className={`w-12 h-12 ${isPositive ? 'bg-green-100' : 'bg-red-100'} rounded-full flex items-center justify-center text-2xl`}>
          {icon}
        </div>
        <div>
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">{label}</p>
          <h3 className="text-2xl font-bold text-gray-800">{value}</h3>
          {(deltaPercent || delta) && (
            <p className={`text-sm flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
              {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              {deltaPercent || delta} {delta ? 'today' : 'This week'}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default KPICard;
