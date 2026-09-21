import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Receipt, RefreshCw, Smartphone, Banknote } from 'lucide-react';

interface QuickAction {
  icon: React.ElementType;
  label: string;
  description: string;
  path: string;
  color: string;
  bgColor: string;
}

const QuickActions: React.FC = () => {
  const navigate = useNavigate();

  const actions: QuickAction[] = [
    {
      icon: Receipt,
      label: 'Pay Bills',
      description: 'Utility & service payments',
      path: '/payments/bills',
      color: 'text-blue-600',
      bgColor: 'bg-blue-50 hover:bg-blue-100',
    },
    {
      icon: RefreshCw,
      label: 'Convert Currency',
      description: 'Exchange crypto & fiat',
      path: '/convert',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50 hover:bg-purple-100',
    },
    {
      icon: Smartphone,
      label: 'Top-Up',
      description: 'Add funds to wallet',
      path: '/transactions/deposits/create',
      color: 'text-green-600',
      bgColor: 'bg-green-50 hover:bg-green-100',
    },
    {
      icon: Banknote,
      label: 'Withdraw',
      description: 'Cash out funds',
      path: '/transactions/withdrawals/create',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50 hover:bg-orange-100',
    },
  ];

  return (
    <div className="lg:col-span-2 bg-white rounded-xl p-6 border border-gray-200">
      <div className="mb-4">
        <h2 className="text-lg font-bold text-gray-800">Quick Actions</h2>
        <p className="text-sm text-gray-500">Fast access to common tasks</p>
      </div>
      
      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={() => navigate(action.path)}
              className={`${action.bgColor} rounded-xl p-4 text-left transition-all hover:shadow-md`}
            >
              <div className={`w-12 h-12 ${action.bgColor.replace('50', '100').replace('hover:', '')} rounded-full flex items-center justify-center mb-3`}>
                <Icon className={`w-6 h-6 ${action.color}`} />
              </div>
              <h3 className="font-semibold text-gray-800 mb-1">{action.label}</h3>
              <p className="text-xs text-gray-500">{action.description}</p>
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default QuickActions;
