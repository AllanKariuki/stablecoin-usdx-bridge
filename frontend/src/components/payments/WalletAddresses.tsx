import React, { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const WalletAddresses: React.FC = () => {
  const [copied, setCopied] = useState(false);

  const handleCopyAddress = (address: string) => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-4">Your Wallet Addresses</h2>
      
      {/* Bitcoin Address */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-2">Bitcoin</p>
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3 flex items-center justify-between">
          <code className="text-xs text-gray-600 truncate">1A1z7agoat2wSEAsWqJ93z7KPVrfJ2aXXX</code>
          <button
            onClick={() => handleCopyAddress('1A1z7agoat2wSEAsWqJ93z7KPVrfJ2aXXX')}
            className="ml-2 p-2 hover:bg-gray-200 rounded"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Ethereum Address */}
      <div className="mb-6">
        <p className="text-sm font-semibold text-gray-700 mb-2">Ethereum</p>
        <div className="bg-gray-50 border border-gray-300 rounded-lg p-3 flex items-center justify-between">
          <code className="text-xs text-gray-600 truncate">0x742d35Cc6634C0532925a3b844Bc9e7595f123456</code>
          <button
            onClick={() => handleCopyAddress('0x742d35Cc6634C0532925a3b844Bc9e7595f123456')}
            className="ml-2 p-2 hover:bg-gray-200 rounded"
          >
            {copied ? <Check className="w-4 h-4 text-green-600" /> : <Copy className="w-4 h-4 text-gray-400" />}
          </button>
        </div>
      </div>

      {/* Bank Account */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">Bank Account</p>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs text-gray-600 mb-1">Account Number: <span className="font-semibold">123-456-7890</span></p>
          <p className="text-xs text-gray-600">Routing Number: <span className="font-semibold">021000021</span></p>
        </div>
      </div>
    </div>
  );
};

export default WalletAddresses;
