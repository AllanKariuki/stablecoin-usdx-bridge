import React from 'react';
import { Lock } from 'lucide-react';

interface WalletFormData {
  type: 'fiat' | 'crypto' | null;
  currency: string;
  nickname: string;
  isDefault: boolean;
  network?: string;
}

interface WalletConfirmationProps {
  formData: WalletFormData;
  onConfirm: () => void;
}

const WalletConfirmation: React.FC<WalletConfirmationProps> = ({ formData, onConfirm }) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Review Wallet Details</h2>
        <p className="text-gray-600">Please confirm the information before creating your wallet</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Wallet Type</span>
          <span className="font-semibold text-gray-800 capitalize">{formData.type} Wallet</span>
        </div>
        <div className="flex justify-between items-center pb-4 border-b border-gray-200">
          <span className="text-gray-600">Currency</span>
          <span className="font-semibold text-gray-800">{formData.currency}</span>
        </div>
        {formData.nickname && (
          <div className="flex justify-between items-center pb-4 border-b border-gray-200">
            <span className="text-gray-600">Nickname</span>
            <span className="font-semibold text-gray-800">{formData.nickname}</span>
          </div>
        )}
        {formData.network && (
          <div className="flex justify-between items-center pb-4 border-b border-gray-200">
            <span className="text-gray-600">Network</span>
            <span className="font-semibold text-gray-800">{formData.network}</span>
          </div>
        )}
        <div className="flex justify-between items-center">
          <span className="text-gray-600">Default Wallet</span>
          <span className="font-semibold text-gray-800">{formData.isDefault ? 'Yes' : 'No'}</span>
        </div>
      </div>

      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex gap-3">
        <Lock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-blue-800">
          Your wallet is secured with encryption. Make sure to keep your credentials safe.
        </p>
      </div>

      <button
        onClick={onConfirm}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Create Wallet
      </button>
    </div>
  );
};

export default WalletConfirmation;
