import React, { useState } from 'react';
import { Plus } from 'lucide-react';

interface Recipient {
  id: string;
  name: string;
  type: 'individual' | 'business' | 'account' | 'crypto-wallet';
  account: string;
  avatar?: string;
  walletType?: 'fiat' | 'crypto' | 'stablecoin';
  currency?: string;
}

interface RecipientSelectionProps {
  selectedRecipient: string;
  newRecipient: Recipient | null;
  onRecipientSelect: (recipientId: string) => void;
  onNewRecipientSave: (recipient: Recipient) => void;
  onContinue: () => void;
}

const RecipientSelection: React.FC<RecipientSelectionProps> = ({
  selectedRecipient,
  newRecipient,
  onRecipientSelect,
  onNewRecipientSave,
  onContinue,
}) => {
  const [showNewRecipient, setShowNewRecipient] = useState(false);
  const [newRecipientData, setNewRecipientData] = useState({
    name: '',
    type: 'individual' as 'individual' | 'business' | 'crypto-wallet',
    account: '',
    walletType: 'fiat' as 'fiat' | 'crypto' | 'stablecoin',
    currency: 'USD',
  });

  const savedRecipients: Recipient[] = [
    { id: 'r1', name: 'John Doe', type: 'individual', account: 'john@email.com', walletType: 'fiat' },
    { id: 'r2', name: 'Jane Smith', type: 'individual', account: 'jane@email.com', walletType: 'fiat' },
    { id: 'r3', name: 'Tech Company Inc', type: 'business', account: 'payments@techco.com', walletType: 'fiat' },
    { id: 'r4', name: 'Alice (BTC)', type: 'crypto-wallet', account: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', walletType: 'crypto', currency: 'BTC' },
    { id: 'r5', name: 'Bob (ETH)', type: 'crypto-wallet', account: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb', walletType: 'crypto', currency: 'ETH' },
    { id: 'r6', name: 'Carol (USDT)', type: 'crypto-wallet', account: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063', walletType: 'stablecoin', currency: 'USDT' },
  ];

  const handleSaveNewRecipient = () => {
    const recipient: Recipient = {
      id: `r${Date.now()}`,
      name: newRecipientData.name,
      type: newRecipientData.type,
      account: newRecipientData.account,
      walletType: newRecipientData.walletType,
      currency: newRecipientData.currency,
    };
    onNewRecipientSave(recipient);
    setShowNewRecipient(false);
    setNewRecipientData({ name: '', type: 'individual', account: '', walletType: 'fiat', currency: 'USD' });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Who do you want to send to?</h2>
        <p className="text-gray-600">Select from saved recipients or add a new one</p>
      </div>

      {/* Saved Recipients */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Saved Recipients</h3>
        <div className="space-y-2">
          {savedRecipients.map((recipient) => (
            <button
              key={recipient.id}
              onClick={() => onRecipientSelect(recipient.id)}
              className={`w-full p-4 border-2 rounded-lg text-left transition-all flex items-center gap-3 ${
                selectedRecipient === recipient.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                {recipient.name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="font-semibold text-gray-800">{recipient.name}</p>
                <p className="text-sm text-gray-600">{recipient.account}</p>
                {recipient.walletType && (
                  <p className="text-xs text-blue-600 mt-1">
                    {recipient.walletType === 'crypto' && '🔐 Crypto Wallet'}
                    {recipient.walletType === 'stablecoin' && '💵 Stablecoin'}
                    {recipient.walletType === 'fiat' && '💳 Fiat'}
                    {recipient.currency && ` • ${recipient.currency}`}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Add New Recipient */}
      <button
        onClick={() => setShowNewRecipient(!showNewRecipient)}
        className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg text-gray-700 font-medium hover:border-blue-500 hover:bg-blue-50 transition-all flex items-center gap-2 justify-center"
      >
        <Plus className="w-5 h-5" />
        Add New Recipient
      </button>

      {/* New Recipient Form */}
      {showNewRecipient && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <h3 className="font-semibold text-gray-800">New Recipient</h3>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Name</label>
            <input
              type="text"
              value={newRecipientData.name}
              onChange={(e) => setNewRecipientData({ ...newRecipientData, name: e.target.value })}
              placeholder="Full name"
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Recipient Type</label>
            <select
              value={newRecipientData.type}
              onChange={(e) => setNewRecipientData({ ...newRecipientData, type: e.target.value as 'individual' | 'business' | 'crypto-wallet' })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="individual">Individual</option>
              <option value="business">Business</option>
              <option value="crypto-wallet">Crypto Wallet</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Wallet Type</label>
            <select
              value={newRecipientData.walletType}
              onChange={(e) => setNewRecipientData({ ...newRecipientData, walletType: e.target.value as 'fiat' | 'crypto' | 'stablecoin' })}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="fiat">Fiat Currency</option>
              <option value="crypto">Cryptocurrency</option>
              <option value="stablecoin">Stablecoin</option>
            </select>
          </div>

          {(newRecipientData.walletType === 'crypto' || newRecipientData.walletType === 'stablecoin') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency/Token</label>
              <select
                value={newRecipientData.currency}
                onChange={(e) => setNewRecipientData({ ...newRecipientData, currency: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                {newRecipientData.walletType === 'crypto' && (
                  <>
                    <option value="BTC">Bitcoin (BTC)</option>
                    <option value="ETH">Ethereum (ETH)</option>
                    <option value="SOL">Solana (SOL)</option>
                    <option value="BNB">Binance Coin (BNB)</option>
                  </>
                )}
                {newRecipientData.walletType === 'stablecoin' && (
                  <>
                    <option value="USDT">Tether (USDT)</option>
                    <option value="USDC">USD Coin (USDC)</option>
                    <option value="DAI">Dai (DAI)</option>
                    <option value="BUSD">Binance USD (BUSD)</option>
                  </>
                )}
              </select>
            </div>
          )}

          {newRecipientData.walletType === 'fiat' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Currency</label>
              <select
                value={newRecipientData.currency}
                onChange={(e) => setNewRecipientData({ ...newRecipientData, currency: e.target.value })}
                className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="USD">USD - US Dollar</option>
                <option value="EUR">EUR - Euro</option>
                <option value="GBP">GBP - British Pound</option>
                <option value="KES">KES - Kenyan Shilling</option>
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {newRecipientData.type === 'crypto-wallet' ? 'Wallet Address' : 'Account (Email/Phone/Account Number)'}
            </label>
            <input
              type="text"
              value={newRecipientData.account}
              onChange={(e) => setNewRecipientData({ ...newRecipientData, account: e.target.value })}
              placeholder={newRecipientData.type === 'crypto-wallet' ? 'Enter wallet address...' : 'Email or account identifier'}
              className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSaveNewRecipient}
              disabled={!newRecipientData.name || !newRecipientData.account}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Save & Continue
            </button>
            <button
              onClick={() => setShowNewRecipient(false)}
              className="flex-1 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <button
        onClick={onContinue}
        disabled={!selectedRecipient && !newRecipient}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default RecipientSelection;
