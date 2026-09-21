import React from 'react';
import { AlertCircle } from 'lucide-react';

interface WalletFormData {
  type: 'fiat' | 'crypto' | null;
  currency: string;
  nickname: string;
  isDefault: boolean;
  network?: string;
}

interface WalletDetailsFormProps {
  formData: WalletFormData;
  onUpdate: (data: Partial<WalletFormData>) => void;
  onContinue: () => void;
}

const WalletDetailsForm: React.FC<WalletDetailsFormProps> = ({ formData, onUpdate, onContinue }) => {
  const fiatCurrencies = ['USD', 'EUR', 'GBP', 'KES', 'NGN'];
  const cryptoCurrencies = [
    { name: 'Bitcoin', symbol: 'BTC', networks: ['Bitcoin'] },
    { name: 'Ethereum', symbol: 'ETH', networks: ['Ethereum', 'BSC', 'Polygon'] },
    { name: 'Tether', symbol: 'USDT', networks: ['Ethereum', 'BSC', 'Polygon', 'Tron'] },
    { name: 'Solana', symbol: 'SOL', networks: ['Solana'] },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          {formData.type === 'fiat' ? 'Fiat Wallet Details' : 'Crypto Wallet Details'}
        </h2>
        <p className="text-gray-600">Configure your wallet settings</p>
      </div>

      {formData.type === 'fiat' ? (
        /* Fiat Wallet Form */
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Currency</label>
            <select
              value={formData.currency}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Choose a currency...</option>
              {fiatCurrencies.map((curr) => (
                <option key={curr} value={curr}>
                  {curr}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Wallet Nickname (Optional)</label>
            <input
              type="text"
              placeholder="e.g., My Savings Account"
              value={formData.nickname}
              onChange={(e) => onUpdate({ nickname: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <input
              type="checkbox"
              id="default"
              checked={formData.isDefault}
              onChange={(e) => onUpdate({ isDefault: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="default" className="text-sm text-gray-700">
              Set as default wallet for deposits
            </label>
          </div>
        </div>
      ) : (
        /* Crypto Wallet Form */
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Select Cryptocurrency</label>
            <select
              value={formData.currency}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Choose a cryptocurrency...</option>
              {cryptoCurrencies.map((curr) => (
                <option key={curr.symbol} value={curr.symbol}>
                  {curr.name} ({curr.symbol})
                </option>
              ))}
            </select>
          </div>

          {formData.currency && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Select Network</label>
              <select
                value={formData.network || ''}
                onChange={(e) => onUpdate({ network: e.target.value })}
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Choose a network...</option>
                {cryptoCurrencies
                  .find((c) => c.symbol === formData.currency)
                  ?.networks.map((network) => (
                    <option key={network} value={network}>
                      {network}
                    </option>
                  ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Wallet Nickname (Optional)</label>
            <input
              type="text"
              placeholder="e.g., My Trading Wallet"
              value={formData.nickname}
              onChange={(e) => onUpdate({ nickname: e.target.value })}
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-yellow-800">
              Save your seed phrase and private keys in a secure location. We cannot recover lost wallets.
            </p>
          </div>

          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <input
              type="checkbox"
              id="default"
              checked={formData.isDefault}
              onChange={(e) => onUpdate({ isDefault: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300"
            />
            <label htmlFor="default" className="text-sm text-gray-700">
              Set as default wallet for transactions
            </label>
          </div>
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={!formData.currency}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default WalletDetailsForm;
