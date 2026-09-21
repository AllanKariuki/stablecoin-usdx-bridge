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

interface AmountEntryProps {
  selectedProvider: BillProvider;
  selectedAccount: SavedAccount;
  amount: number;
  setAmount: (amount: number) => void;
  onContinue: () => void;
}

const AmountEntry: React.FC<AmountEntryProps> = ({
  selectedProvider,
  selectedAccount,
  amount,
  setAmount,
  onContinue,
}) => {
  const fee = (amount * 0.01).toFixed(2);

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Enter Amount</h2>
        <p className="text-gray-600">How much do you want to pay?</p>
      </div>

      <div className="space-y-4">
        {/* Bill Details */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          <div className="flex justify-between">
            <span className="text-gray-600">Provider</span>
            <span className="font-semibold text-gray-800">{selectedProvider.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-gray-600">Account</span>
            <span className="font-semibold text-gray-800">{selectedAccount.nickname}</span>
          </div>
        </div>

        {/* Quick Amounts */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Quick amounts</label>
          <div className="grid grid-cols-4 gap-2">
            {[500, 1000, 2500, 5000].map((quick) => (
              <button
                key={quick}
                onClick={() => setAmount(quick)}
                className={`py-2 rounded-lg font-medium transition-colors ${
                  amount === quick
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                ${quick}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Custom amount</label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-gray-600">$</span>
            <input
              type="number"
              value={amount || ''}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              placeholder="0.00"
              className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Fee Breakdown */}
        {amount > 0 && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">Amount:</span>
              <span className="font-medium text-gray-800">${amount.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-sm pb-2 border-b border-blue-200">
              <span className="text-gray-600">Fee:</span>
              <span className="font-medium text-gray-800">${fee}</span>
            </div>
            <div className="flex justify-between text-sm font-semibold">
              <span className="text-gray-800">Total:</span>
              <span className="text-gray-800">${(amount + parseFloat(fee)).toFixed(2)}</span>
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onContinue}
        disabled={amount <= 0}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Review Payment
      </button>
    </div>
  );
};

export default AmountEntry;
