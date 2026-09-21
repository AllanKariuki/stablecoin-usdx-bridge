import React from 'react';

type WithdrawalMethod = 'bank' | 'mobile' | 'crypto' | 'cash' | null;

interface MethodSelectionProps {
  selectedMethod: WithdrawalMethod;
  onMethodSelect: (method: WithdrawalMethod) => void;
  onContinue: () => void;
}

const MethodSelection: React.FC<MethodSelectionProps> = ({
  selectedMethod,
  onMethodSelect,
  onContinue,
}) => {
  const methodInfo = {
    bank: { title: 'Bank Transfer', icon: '🏦' },
    mobile: { title: 'Mobile Money', icon: '📱' },
    crypto: { title: 'Crypto Transfer', icon: '₿' },
    cash: { title: 'Cash Pickup', icon: '💵' },
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Select Withdrawal Method</h2>
        <p className="text-gray-600">How do you want to withdraw your funds?</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Object.entries(methodInfo).map(([key, info]) => (
          <button
            key={key}
            onClick={() => onMethodSelect(key as WithdrawalMethod)}
            className={`p-6 border-2 rounded-xl text-left transition-all ${
              selectedMethod === key
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="text-3xl mb-3">{info.icon}</div>
            <h3 className="font-semibold text-gray-800">{info.title}</h3>
          </button>
        ))}
      </div>

      <button
        onClick={onContinue}
        disabled={!selectedMethod}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default MethodSelection;
