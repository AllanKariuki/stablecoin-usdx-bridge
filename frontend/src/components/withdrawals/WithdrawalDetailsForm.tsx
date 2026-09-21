import React from 'react';

type WithdrawalMethod = 'bank' | 'mobile' | 'crypto' | 'cash' | null;

interface Wallet {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface WithdrawalDetailsFormProps {
  amount: number;
  destinationAccount: string;
  accountHolder: string;
  method: WithdrawalMethod;
  selectedWallet: Wallet | undefined;
  onAmountChange: (amount: number) => void;
  onDestinationAccountChange: (account: string) => void;
  onAccountHolderChange: (holder: string) => void;
  onMaxClick: () => void;
  onContinue: () => void;
}

const WithdrawalDetailsForm: React.FC<WithdrawalDetailsFormProps> = ({
  amount,
  destinationAccount,
  accountHolder,
  method,
  selectedWallet,
  onAmountChange,
  onDestinationAccountChange,
  onAccountHolderChange,
  onMaxClick,
  onContinue,
}) => {
  const withdrawalFee = amount * 0.01; // 1% fee

  const getPlaceholder = () => {
    switch (method) {
      case 'bank':
        return 'Bank Account Number';
      case 'mobile':
        return 'Phone Number';
      case 'crypto':
        return 'Wallet Address';
      default:
        return 'Account Number';
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Withdrawal Details</h2>
        <p className="text-gray-600">Enter your withdrawal information</p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <span className="absolute left-4 top-3 text-gray-600">$</span>
              <input
                type="number"
                value={amount || ''}
                onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={onMaxClick}
              className="px-4 py-3 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium transition-colors"
            >
              Max
            </button>
          </div>
          {selectedWallet && (
            <p className="text-xs text-gray-600 mt-1">
              Available: ${selectedWallet.balance.toFixed(2)} {selectedWallet.currency}
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Destination Account</label>
          <input
            type="text"
            placeholder={getPlaceholder()}
            value={destinationAccount}
            onChange={(e) => onDestinationAccountChange(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Account Holder Name</label>
          <input
            type="text"
            value={accountHolder}
            onChange={(e) => onAccountHolderChange(e.target.value)}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
          <p className="font-medium mb-2">Fee Breakdown</p>
          <div className="flex justify-between text-sm">
            <span>Withdrawal Amount:</span>
            <span>${amount.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm mt-1 pt-1 border-t border-blue-200">
            <span>Withdrawal Fee:</span>
            <span>${withdrawalFee.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold text-sm mt-2 pt-2 border-t border-blue-200">
            <span>You will receive:</span>
            <span>${(amount - withdrawalFee).toFixed(2)}</span>
          </div>
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!amount || !destinationAccount || !accountHolder}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default WithdrawalDetailsForm;
