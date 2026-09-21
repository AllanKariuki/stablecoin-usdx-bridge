import React, { useState } from 'react';
import { Copy, CheckCircle } from 'lucide-react';

type DepositMethod = 'bank' | 'card' | 'mobile' | 'crypto' | 'cash' | null;

interface DepositFormData {
  wallet: string;
  method: DepositMethod;
  amount: number;
  currency: string;
  reference: string;
}

interface DepositDetailsFormProps {
  formData: DepositFormData;
  onUpdate: (data: Partial<DepositFormData>) => void;
  onContinue: () => void;
}

const DepositDetailsForm: React.FC<DepositDetailsFormProps> = ({ formData, onUpdate, onContinue }) => {
  const [copied, setCopied] = useState(false);

  const wallets = [
    { id: 'w1', name: 'Main Wallet', balance: '$2,450.50', currency: 'USD' },
    { id: 'w2', name: 'Savings Wallet', balance: '$1,200.00', currency: 'USD' },
    { id: 'w3', name: 'Trading Wallet', balance: '$850.25', currency: 'USD' },
  ];

  const depositAddress = '1A2B3C4D5E6F7G8H9I0J';

  const methodInfo = {
    bank: { title: 'Bank Transfer' },
    card: { title: 'Card Payment' },
    mobile: { title: 'Mobile Money' },
    crypto: { title: 'Crypto Transfer' },
    cash: { title: 'Cash Deposit' },
  };

  const handleCopyAddress = () => {
    navigator.clipboard.writeText(depositAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">
          {formData.method && methodInfo[formData.method]?.title} Details
        </h2>
        <p className="text-gray-600">Enter the deposit information</p>
      </div>

      <div className="space-y-4">
        {/* Wallet Selection */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Destination Wallet</label>
          <select
            value={formData.wallet}
            onChange={(e) => onUpdate({ wallet: e.target.value })}
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          >
            <option value="">Select a wallet...</option>
            {wallets.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} ({w.balance})
              </option>
            ))}
          </select>
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Amount</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={formData.amount || ''}
              onChange={(e) => onUpdate({ amount: parseFloat(e.target.value) || 0 })}
              placeholder="0.00"
              className="flex-1 px-4 py-3 focus:bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={formData.currency}
              onChange={(e) => onUpdate({ currency: e.target.value })}
              className="px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
            </select>
          </div>
        </div>

        {/* Method-Specific Fields */}
        {formData.method === 'bank' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Bank Account</label>
              <select className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option>Select linked account...</option>
                <option>Chase Checking - 1234</option>
                <option>Bank of America - 5678</option>
              </select>
            </div>
          </>
        )}

        {formData.method === 'card' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Card</label>
              <select className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option>Select card...</option>
                <option>Visa ****1234</option>
                <option>MasterCard ****5678</option>
              </select>
            </div>
          </>
        )}

        {formData.method === 'mobile' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Provider</label>
              <select className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                <option>Select provider...</option>
                <option>M-Pesa</option>
                <option>Airtel Money</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
              <input
                type="tel"
                placeholder="+1 (555) 000-0000"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </>
        )}

        {formData.method === 'crypto' && (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Your Deposit Address</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={depositAddress}
                  readOnly
                  className="flex-1 px-4 py-3 border border-gray-200 rounded-lg bg-gray-50"
                />
                <button
                  onClick={handleCopyAddress}
                  className="px-4 py-3 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                >
                  <Copy className="w-5 h-5 text-gray-600" />
                </button>
              </div>
              {copied && (
                <p className="text-sm text-green-600 mt-2 flex items-center gap-1">
                  <CheckCircle className="w-4 h-4" /> Copied to clipboard
                </p>
              )}
            </div>
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
              Send only the currency specified to this address. Other cryptocurrencies will be lost.
            </div>
          </>
        )}

        {/* Reference */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Reference Number (Optional)</label>
          <input
            type="text"
            value={formData.reference}
            onChange={(e) => onUpdate({ reference: e.target.value })}
            placeholder="For your records"
            className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
      </div>

      <button
        onClick={onContinue}
        disabled={!formData.wallet || formData.amount <= 0}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Continue
      </button>
    </div>
  );
};

export default DepositDetailsForm;
