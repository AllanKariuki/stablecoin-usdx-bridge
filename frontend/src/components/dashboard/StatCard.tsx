import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';

interface StatCardProps {
  icon: string;
  amount: string;
  change: string;
  color: string;
}

const StatCard: React.FC<StatCardProps> = ({ icon, amount, change, color }) => {
  const isPositive = change.includes('+');
  
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 py-5">
        <div className={`w-12 h-12 ${color} rounded-full flex items-center justify-center text-2xl`}>
          {icon}
        </div>
        <div>
          <h3 className="text-2xl font-bold text-gray-800">{amount}</h3>
          <p className={`text-sm flex items-center gap-1 ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {isPositive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
            {change} This week
          </p>
        </div>
      </div>
    </div>
  );
};

export default StatCard;
