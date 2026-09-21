import React from 'react';

interface Recipient {
  id: string;
  name: string;
  type: 'individual' | 'business' | 'account' | 'crypto-wallet';
  account: string;
  avatar?: string;
  walletType?: 'fiat' | 'crypto' | 'stablecoin';
  currency?: string;
}

interface PaymentDetailsProps {
  recipient: Recipient;
  sourceWallet: string;
  amount: number;
  description: string;
  deliveryType: 'instant' | 'scheduled';
  scheduleDate?: string;
  assetType: 'fiat' | 'crypto' | 'stablecoin';
  selectedCurrency: string;
  onWalletChange: (walletId: string) => void;
  onAmountChange: (amount: number) => void;
  onDescriptionChange: (description: string) => void;
  onDeliveryTypeChange: (type: 'instant' | 'scheduled') => void;
  onScheduleDateChange: (date: string) => void;
  onAssetTypeChange: (type: 'fiat' | 'crypto' | 'stablecoin') => void;
  onCurrencyChange: (currency: string) => void;
  onContinue: () => void;
}

const PaymentDetails: React.FC<PaymentDetailsProps> = ({
  recipient,
  sourceWallet,
  amount,
  description,
  deliveryType,
  scheduleDate,
  assetType,
  selectedCurrency,
  onWalletChange,
  onAmountChange,
  onDescriptionChange,
  onDeliveryTypeChange,
  onScheduleDateChange,
  onAssetTypeChange,
  onCurrencyChange,
  onContinue,
}) => {
  // Fiat wallets
  const fiatWallets = [
    { id: 'fw1', name: 'USD Main Wallet', balance: 5234.50, currency: 'USD', type: 'fiat' },
    { id: 'fw2', name: 'EUR Savings', balance: 3500.00, currency: 'EUR', type: 'fiat' },
    { id: 'fw3', name: 'KES Wallet', balance: 150000.00, currency: 'KES', type: 'fiat' },
  ];

  // Crypto wallets
  const cryptoWallets = [
    { id: 'cw1', name: 'Bitcoin Wallet', balance: 0.5234, currency: 'BTC', type: 'crypto' },
    { id: 'cw2', name: 'Ethereum Wallet', balance: 2.3456, currency: 'ETH', type: 'crypto' },
    { id: 'cw3', name: 'Solana Wallet', balance: 150.25, currency: 'SOL', type: 'crypto' },
  ];

  // Stablecoin wallets
  const stablecoinWallets = [
    { id: 'sw1', name: 'USDT Wallet', balance: 10000.00, currency: 'USDT', type: 'stablecoin' },
    { id: 'sw2', name: 'USDC Wallet', balance: 5500.00, currency: 'USDC', type: 'stablecoin' },
    { id: 'sw3', name: 'DAI Wallet', balance: 2500.00, currency: 'DAI', type: 'stablecoin' },
  ];

  const allWallets = [...fiatWallets, ...cryptoWallets, ...stablecoinWallets];
  const filteredWallets = allWallets.filter(w => w.type === assetType);
  const selectedWallet = allWallets.find((w) => w.id === sourceWallet);
  
  const fee = assetType === 'fiat' ? (amount * 0.01).toFixed(2) : assetType === 'crypto' ? (amount * 0.001).toFixed(6) : (amount * 0.005).toFixed(2);

  const getCurrencySymbol = (currency: string) => {
    const symbols: Record<string, string> = {
      USD: '$', EUR: '€', GBP: '£', KES: 'KSh',
      BTC: '₿', ETH: 'Ξ', SOL: '◎',
      USDT: 'USDT', USDC: 'USDC', DAI: 'DAI'
    };
    return symbols[currency] || currency;
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Payment Details</h2>
        <p className="text-gray-600">Enter the amount and other details</p>
      </div>

      {/* Recipient Summary */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
          {recipient.name.charAt(0)}
        </div>
        <div>
          <p className="font-semibold text-gray-800">{recipient.name}</p>
          <p className="text-sm text-gray-600">{recipient.account}</p>
        </div>
      </div>

      <div className="space-y-4">
        {/* Asset Type Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Asset Type</label>
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => onAssetTypeChange('fiat')}
              className={`p-3 border-2 rounded-lg transition-all ${
                assetType === 'fiat'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-sm">💵 Fiat</p>
            </button>
            <button
              onClick={() => onAssetTypeChange('crypto')}
              className={`p-3 border-2 rounded-lg transition-all ${
                assetType === 'crypto'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-sm">🔐 Crypto</p>
            </button>
            <button
              onClick={() => onAssetTypeChange('stablecoin')}
              className={`p-3 border-2 rounded-lg transition-all ${
                assetType === 'stablecoin'
                  ? 'border-blue-500 bg-blue-50 text-blue-700'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <p className="font-semibold text-sm">💲 Stablecoin</p>
            </button>
          </div>
        </div>

        {/* Source Wallet */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">From Wallet</label>
          <select
            value={sourceWallet}
            onChange={(e) => onWalletChange(e.target.value)}
            className="w-full px-4 py-3 border-b-2 border-gray-300 bg-transparent focus:border-blue-600 focus:outline-none transition-colors"
          >
            <option value="">Select a wallet...</option>
            {filteredWallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} - {getCurrencySymbol(w.currency)}{w.balance.toFixed(assetType === 'crypto' ? 6 : 2)}
              </option>
            ))}
          </select>
        </div>

        {/* Currency Selection (if needed) */}
        {selectedWallet && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
            <div className="px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg">
              <p className="font-semibold text-gray-800">{selectedWallet.currency}</p>
            </div>
          </div>
        )}

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
          <div className="relative">
            <span className="absolute left-4 top-3 text-gray-600">
              {selectedWallet ? getCurrencySymbol(selectedWallet.currency) : '$'}
            </span>
            <input
              type="number"
              step={assetType === 'crypto' ? '0.000001' : '0.01'}
              value={amount || ''}
              onChange={(e) => onAmountChange(parseFloat(e.target.value) || 0)}
              placeholder={assetType === 'crypto' ? '0.000000' : '0.00'}
              className="w-full pl-12 pr-4 py-3 border-b-2 border-gray-300 bg-transparent focus:border-blue-600 focus:outline-none transition-colors"
            />
          </div>
          {selectedWallet && (
            <p className="text-xs text-gray-600 mt-1">
              Available: {getCurrencySymbol(selectedWallet.currency)}{selectedWallet.balance.toFixed(assetType === 'crypto' ? 6 : 2)}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Description (Optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => onDescriptionChange(e.target.value)}
            placeholder="What is this payment for?"
            className="w-full px-4 py-3 border-b-2 border-gray-300 bg-transparent focus:border-blue-600 focus:outline-none transition-colors"
          />
        </div>

        {/* Delivery Type */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Delivery</label>
          <div className="space-y-2">
            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={deliveryType === 'instant'}
                onChange={() => onDeliveryTypeChange('instant')}
              />
              <div>
                <p className="font-medium text-gray-800">Instant Transfer</p>
                <p className="text-xs text-gray-600">Usually within minutes</p>
              </div>
            </label>
            <label className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:bg-gray-50">
              <input
                type="radio"
                checked={deliveryType === 'scheduled'}
                onChange={() => onDeliveryTypeChange('scheduled')}
              />
              <div>
                <p className="font-medium text-gray-800">Schedule Transfer</p>
                <p className="text-xs text-gray-600">Choose date and time</p>
              </div>
            </label>
          </div>
        </div>

        {deliveryType === 'scheduled' && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Schedule Date</label>
            <input
              type="date"
              value={scheduleDate || ''}
              onChange={(e) => onScheduleDateChange(e.target.value)}
              className="w-full px-4 py-3 border-b-2 border-gray-300 bg-transparent focus:border-blue-600 focus:outline-none transition-colors"
            />
          </div>
        )}

        {/* Fee Breakdown */}
        <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-gray-600">Amount:</span>
            <span className="font-medium text-gray-800">
              {selectedWallet ? getCurrencySymbol(selectedWallet.currency) : '$'}{amount.toFixed(assetType === 'crypto' ? 6 : 2)}
            </span>
          </div>
          <div className="flex justify-between text-sm pb-2 border-b border-gray-200">
            <span className="text-gray-600">Network Fee:</span>
            <span className="font-medium text-gray-800">
              {selectedWallet ? getCurrencySymbol(selectedWallet.currency) : '$'}{fee}
            </span>
          </div>
          <div className="flex justify-between text-sm font-semibold">
            <span className="text-gray-800">Total:</span>
            <span className="text-gray-800">
              {selectedWallet ? getCurrencySymbol(selectedWallet.currency) : '$'}
              {(amount + parseFloat(fee)).toFixed(assetType === 'crypto' ? 6 : 2)}
            </span>
          </div>
          {assetType === 'crypto' && (
            <p className="text-xs text-gray-500 mt-2">
              * Network fees may vary based on blockchain congestion
            </p>
          )}
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!sourceWallet || amount <= 0}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Review Payment
      </button>
    </div>
  );
};

export default PaymentDetails;
