import React from 'react';

type WithdrawalMethod = 'bank' | 'mobile' | 'crypto' | 'cash' | null;

interface Wallet {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface WithdrawalConfirmationProps {
  selectedWallet: Wallet | undefined;
  method: WithdrawalMethod;
  amount: number;
  onSubmit: () => void;
}

const WithdrawalConfirmation: React.FC<WithdrawalConfirmationProps> = ({
  selectedWallet,
  method,
  amount,
  onSubmit,
}) => {
  const methodInfo = {
    bank: { title: 'Bank Transfer', icon: '🏦' },
    mobile: { title: 'Mobile Money', icon: '📱' },
    crypto: { title: 'Crypto Transfer', icon: '₿' },
    cash: { title: 'Cash Pickup', icon: '💵' },
  };

  const withdrawalFee = amount * 0.01; // 1% fee

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Confirm Withdrawal</h2>
        <p className="text-gray-600">Please review the details before completing</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">From Wallet</span>
          <span className="font-semibold text-gray-800">{selectedWallet?.name}</span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Method</span>
          <span className="font-semibold text-gray-800">{method ? methodInfo[method]?.title : 'N/A'}</span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Withdrawal Amount</span>
          <span className="font-semibold text-gray-800">${amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Fee</span>
          <span className="font-semibold text-gray-800">${withdrawalFee.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-gray-600 font-medium">You will receive</span>
          <span className="font-bold text-lg text-gray-800">${(amount - withdrawalFee).toFixed(2)}</span>
        </div>
      </div>

      <button
        onClick={onSubmit}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Complete Withdrawal
      </button>
    </div>
  );
};

export default WithdrawalConfirmation;
