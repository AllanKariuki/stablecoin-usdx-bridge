import React from 'react';

interface BillProvider {
  id: string;
  name: string;
  icon: string;
  category: string;
}

interface SavedAccount {
  id: string;
  provider: string;
  accountNumber: string;
  nickname: string;
}

interface PaymentConfirmationProps {
  selectedProvider: BillProvider;
  selectedAccount: SavedAccount;
  amount: number;
  onConfirm: () => void;
}

const PaymentConfirmation: React.FC<PaymentConfirmationProps> = ({
  selectedProvider,
  selectedAccount,
  amount,
  onConfirm,
}) => {
  const fee = (amount * 0.01).toFixed(2);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Confirm Payment</h2>
        <p className="text-gray-600">Review your bill payment details</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        <div className="text-center pb-4 border-b border-gray-200">
          <div className="text-4xl mb-2">{selectedProvider.icon}</div>
          <h3 className="font-semibold text-gray-800">{selectedProvider.name}</h3>
        </div>

        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-gray-600">Account</span>
            <span className="font-semibold text-gray-800">{selectedAccount.nickname}</span>
          </div>
          <div className="flex justify-between pb-3 border-b border-gray-200">
            <span className="text-gray-600">Account Number</span>
            <span className="font-semibold text-gray-800">****{selectedAccount.accountNumber.slice(-4)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Amount</span>
            <span className="font-semibold text-gray-800">${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between pb-3 border-b border-gray-200">
            <span className="text-gray-600">Fee</span>
            <span className="font-semibold text-gray-800">${fee}</span>
          </div>
          <div className="flex justify-between">
            <span className="font-semibold text-gray-800">Total</span>
            <span className="font-bold text-lg text-gray-800">${(amount + parseFloat(fee)).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={onConfirm}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Pay Bill
      </button>
    </div>
  );
};

export default PaymentConfirmation;
