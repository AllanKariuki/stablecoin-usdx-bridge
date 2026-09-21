import React from 'react';

const PaymentMethodsList: React.FC = () => {
  const paymentMethods = [
    { icon: '💳', label: 'Card Transfer' },
    { icon: '🏦', label: 'Bank Transfer' },
    { icon: '📱', label: 'Mobile Money' },
    { icon: '₿', label: 'Crypto Transfer' },
  ];

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Receive Via</h2>
      <div className="space-y-3">
        {paymentMethods.map((method, index) => (
          <button
            key={index}
            className="w-full text-left px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-700"
          >
            {method.icon} {method.label}
          </button>
        ))}
      </div>
    </div>
  );
};

export default PaymentMethodsList;
