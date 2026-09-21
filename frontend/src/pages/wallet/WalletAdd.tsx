import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import WalletTypeSelection from '../../components/wallet/WalletTypeSelection';
import WalletDetailsForm from '../../components/wallet/WalletDetailsForm';
import WalletConfirmation from '../../components/wallet/WalletConfirmation';
import WalletSuccess from '../../components/wallet/WalletSuccess';
import { useNavigate } from 'react-router-dom';

interface WalletFormData {
  type: 'fiat' | 'crypto' | null;
  currency: string;
  nickname: string;
  isDefault: boolean;
  network?: string;
}

const WalletAdd: React.FC = () => {
  const navigate = useNavigate();
  const [step, setStep] = useState<'type' | 'details' | 'confirmation' | 'success'>('type');
  const [formData, setFormData] = useState<WalletFormData>({
    type: null,
    currency: '',
    nickname: '',
    isDefault: false,
  });

  const handleTypeSelect = (type: 'fiat' | 'crypto') => {
    setFormData({ ...formData, type });
    setStep('details');
  };

  const handleUpdateFormData = (data: Partial<WalletFormData>) => {
    setFormData({ ...formData, ...data });
  };

  const handleContinue = () => {
    if (!formData.currency) return;
    setStep('confirmation');
  };

  const handleConfirm = () => {
    setStep('success');
  };

  const handleAddAnother = () => {
    setFormData({
      type: null,
      currency: '',
      nickname: '',
      isDefault: false,
    });
    setStep('type');
  };

  const handleBack = () => {
    if (step === 'details') {
      setFormData({ ...formData, type: null });
      setStep('type');
    } else if (step === 'confirmation') {
      setStep('details');
    }
  };

  return (
    <div className="bg-gray-50">
      <div className="flex gap-2 overflow-x-hidden text-sm mt-1 pl-6 mb-3">
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
          onClick={() => navigate('/dashboard')}
        >
          Home
        </button>
        <span className="text-gray-400">/</span>
        <button
          className="text-gray-500 hover:cursor-pointer hover:text-gray-800 transition-colors"
        >
          Wallets
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
          Create wallet
        </span>
      </div>
      {/* Header */}
      <div className="sticky top-0 z-10">
        <div className="max-w-2xl px-6 py-4 flex items-center gap-4">
          {step !== 'type' && (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-800">Add Wallet</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-6 py-8">
        {step === 'type' && <WalletTypeSelection onSelect={handleTypeSelect} />}
        
        {step === 'details' && (
          <WalletDetailsForm
            formData={formData}
            onUpdate={handleUpdateFormData}
            onContinue={handleContinue}
          />
        )}
        
        {step === 'confirmation' && (
          <WalletConfirmation formData={formData} onConfirm={handleConfirm} />
        )}
        
        {step === 'success' && (
          <WalletSuccess formData={formData} onAddAnother={handleAddAnother} />
        )}
      </div>
    </div>
  );
};

export default WalletAdd;
