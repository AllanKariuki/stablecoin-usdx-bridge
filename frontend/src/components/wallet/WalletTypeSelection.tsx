import React from 'react';

interface WalletTypeSelectionProps {
  onSelect: (type: 'fiat' | 'crypto') => void;
}

const WalletTypeSelection: React.FC<WalletTypeSelectionProps> = ({ onSelect }) => {
  const fiatCurrencies = ['USD', 'EUR', 'GBP', 'KES', 'NGN'];
  const cryptoCurrencies = [
    { name: 'Bitcoin', symbol: 'BTC' },
    { name: 'Ethereum', symbol: 'ETH' },
    { name: 'Tether', symbol: 'USDT' },
    { name: 'Solana', symbol: 'SOL' },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Select Wallet Type</h2>
        <p className="text-gray-600">Choose whether you want to create a fiat or cryptocurrency wallet</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fiat Option */}
        <button
          onClick={() => onSelect('fiat')}
          className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 hover:shadow-sm transition-all text-left group cursor-pointer"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center group-hover:bg-green-200 transition-colors">
              <span className="text-2xl">💳</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Fiat Wallet</h3>
              <p className="text-sm text-gray-600 mt-1">USD, EUR, GBP, and more</p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {fiatCurrencies.map((curr) => (
                  <span key={curr} className="px-2 py-1 bg-gray-100 text-xs font-medium text-gray-700 rounded">
                    {curr}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </button>

        {/* Crypto Option */}
        <button
          onClick={() => onSelect('crypto')}
          className="p-6 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 hover:shadow-sm cursor-pointertransition-all text-left group"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center group-hover:bg-orange-200 transition-colors">
              <span className="text-2xl">₿</span>
            </div>
            <div>
              <h3 className="font-semibold text-gray-800">Crypto Wallet</h3>
              <p className="text-sm text-gray-600 mt-1">Bitcoin, Ethereum, and more</p>
              <div className="mt-3 flex gap-2 flex-wrap">
                {cryptoCurrencies.slice(0, 3).map((curr) => (
                  <span key={curr.symbol} className="px-2 py-1 bg-gray-100 text-xs font-medium text-gray-700 rounded">
                    {curr.symbol}
                  </span>
                ))}
                <span className="px-2 py-1 text-xs font-medium text-gray-600">+1</span>
              </div>
            </div>
          </div>
        </button>
      </div>
    </div>
  );
};

export default WalletTypeSelection;
