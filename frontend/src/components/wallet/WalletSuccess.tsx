import React from 'react';

interface WalletFormData {
  type: 'fiat' | 'crypto' | null;
  currency: string;
  nickname: string;
  isDefault: boolean;
  network?: string;
}

interface WalletSuccessProps {
  formData: WalletFormData;
  onAddAnother: () => void;
}

const WalletSuccess: React.FC<WalletSuccessProps> = ({ formData, onAddAnother }) => {
  return (
    <div className="space-y-6 text-center">
      <div>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-2xl">✓</span>
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Wallet Created Successfully!</h2>
        <p className="text-gray-600">Your {formData.currency} {formData.type} wallet is ready to use.</p>
      </div>

      {formData.type === 'crypto' && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-left">
          <h3 className="font-semibold text-gray-800 mb-4">Backup Your Seed Phrase</h3>
          <div className="bg-white p-4 rounded-lg border border-gray-200 font-mono text-sm text-center mb-4 select-all">
            word1 word2 word3 word4 word5 word6 word7 word8 word9 word10 word11 word12
          </div>
          <button className="w-full px-4 py-2 text-blue-600 hover:bg-blue-50 rounded-lg font-medium transition-colors">
            Copy Seed Phrase
          </button>
          <p className="text-xs text-gray-600 mt-4">
            ⚠️ Write this down and store it securely. Never share your seed phrase with anyone.
          </p>
        </div>
      )}

      <div className="space-y-3">
        <button
          onClick={() => window.location.href = '/wallet'}
          className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Go to Wallet
        </button>
        <button 
          onClick={onAddAnother}
          className="w-full px-6 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Add Another Wallet
        </button>
      </div>
    </div>
  );
};

export default WalletSuccess;
