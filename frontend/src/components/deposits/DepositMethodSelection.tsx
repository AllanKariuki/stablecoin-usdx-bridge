import React from 'react';

type DepositMethod = 'bank' | 'card' | 'mobile' | 'crypto' | 'cash' | null;

interface DepositMethodSelectionProps {
  onSelect: (method: DepositMethod) => void;
}

const DepositMethodSelection: React.FC<DepositMethodSelectionProps> = ({ onSelect }) => {
  const methodInfo = {
    bank: {
      title: 'Bank Transfer',
      icon: '🏦',
      description: 'Transfer funds directly from your bank account',
    },
    card: {
      title: 'Card Payment',
      icon: '💳',
      description: 'Use your credit or debit card',
    },
    mobile: {
      title: 'Mobile Wallet',
      icon: '📱',
      description: 'Use mobile wallet services',
    },
    crypto: {
      title: 'Crypto Transfer',
      icon: '₿',
      description: 'Send cryptocurrency to your wallet',
    },
    cash: {
      title: 'Cash Deposit',
      icon: '💵',
      description: 'Visit an authorized cash deposit location',
    },
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Select Deposit Method</h2>
        <p className="text-gray-600">Choose how you want to deposit funds</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(methodInfo).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onSelect(key as DepositMethod)}
            className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 
              hover:bg-blue-50 hover:shadow-md transition-all text-left cursor-pointer"
          >
            <div className="text-3xl mb-3">{info.icon}</div>
            <h3 className="font-semibold text-gray-800">{info.title}</h3>
            <p className="text-sm text-gray-600 mt-1">{info.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
};

export default DepositMethodSelection;
