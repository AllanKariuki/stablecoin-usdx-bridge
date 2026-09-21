import React from 'react';

type DepositMethod = 'bank' | 'card' | 'mobile' | 'crypto' | 'cash' | null;

interface DepositFormData {
  wallet: string;
  method: DepositMethod;
  amount: number;
  currency: string;
  reference: string;
}

interface DepositConfirmationProps {
  formData: DepositFormData;
  onConfirm: () => void;
}

const DepositConfirmation: React.FC<DepositConfirmationProps> = ({ formData, onConfirm }) => {
  const methodInfo = {
    bank: { title: 'Bank Transfer' },
    card: { title: 'Card Payment' },
    mobile: { title: 'Mobile Money' },
    crypto: { title: 'Crypto Transfer' },
    cash: { title: 'Cash Deposit' },
  };

  const calculateFees = () => {
    const feePercentage = formData.method === 'bank' ? 0.5 : 1;
    return (formData.amount * feePercentage) / 100;
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Review Deposit</h2>
        <p className="text-gray-600">Please verify the details before submitting</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Method</span>
          <span className="font-semibold text-gray-800">{formData.method && methodInfo[formData.method]?.title}</span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Amount</span>
          <span className="font-semibold text-gray-800">${formData.amount.toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Fee</span>
          <span className="font-semibold text-gray-800">${calculateFees().toFixed(2)}</span>
        </div>
        <div className="flex justify-between items-center pt-2">
          <span className="text-gray-600 font-medium">Total</span>
          <span className="font-bold text-lg text-gray-800">${(formData.amount + calculateFees()).toFixed(2)}</span>
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Submit Deposit
      </button>
    </div>
  );
};

export default DepositConfirmation;
