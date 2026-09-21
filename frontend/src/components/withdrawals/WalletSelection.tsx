import React from 'react';

interface Wallet {
  id: string;
  name: string;
  balance: number;
  currency: string;
}

interface WalletSelectionProps {
  wallets: Wallet[];
  selectedWallet: string;
  onWalletSelect: (walletId: string) => void;
  onContinue: () => void;
}

const WalletSelection: React.FC<WalletSelectionProps> = ({
  wallets,
  selectedWallet,
  onWalletSelect,
  onContinue,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Select Source Wallet</h2>
        <p className="text-gray-600">Choose which wallet to withdraw from</p>
      </div>

      <div className="space-y-3">
        {wallets.map((wallet) => (
          <button
            key={wallet.id}
            onClick={() => onWalletSelect(wallet.id)}
            className={`w-full p-4 border-2 rounded-lg text-left transition-all ${
              selectedWallet === wallet.id
                ? 'border-blue-600 bg-blue-50'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-gray-800">{wallet.name}</h3>
                <p className="text-sm text-gray-600">Available: ${wallet.balance.toLocaleString()}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-800">${wallet.balance.toFixed(2)}</p>
                <p className="text-xs text-gray-600">{wallet.currency}</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={onContinue}
        disabled={!selectedWallet}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default WalletSelection;
