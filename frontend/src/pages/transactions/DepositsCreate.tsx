import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import DepositMethodSelection from '../../components/deposits/DepositMethodSelection';
import DepositDetailsForm from '../../components/deposits/DepositDetailsForm';
import DepositConfirmation from '../../components/deposits/DepositConfirmation';
import DepositSuccess from '../../components/deposits/DepositSuccess';

type DepositMethod = 'bank' | 'card' | 'mobile' | 'crypto' | 'cash' | null;

interface DepositFormData {
  wallet: string;
  method: DepositMethod;
  amount: number;
  currency: string;
  reference: string;
}

const DepositsCreate: React.FC = () => {
  const [step, setStep] = useState<'method' | 'details' | 'confirm' | 'success'>('method');
  const [formData, setFormData] = useState<DepositFormData>({
    wallet: '',
    method: null,
    amount: 0,
    currency: 'USD',
    reference: '',
  });
  const navigate = useNavigate();

  const handleMethodSelect = (method: DepositMethod) => {
    setFormData({ ...formData, method });
    setStep('details');
  };

  const handleUpdateFormData = (data: Partial<DepositFormData>) => {
    setFormData({ ...formData, ...data });
  };

  const handleContinue = () => {
    if (!formData.wallet || formData.amount <= 0) return;
    setStep('confirm');
  };

  const handleConfirm = () => {
    setStep('success');
  };

  const handleTrackDeposit = () => {
    window.location.href = '/transactions/deposits';
  };

  const handleBackToDashboard = () => {
    window.location.href = '/dashboard';
  };

  const handleBack = () => {
    if (step === 'details') {
      setStep('method');
    } else if (step === 'confirm') {
      setStep('details');
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
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
          Transactions
        </button>
        <span className="text-gray-400">/</span>
        <span className="text-gray-700 font-semibold">
          Make a Deposit
        </span>
      </div>
      {/* Header */}
      <div className="sticky top-0 z-10">
        <div className="max-w-3xl px-6 py-4 flex items-center gap-4">
          {step !== 'method' && step !== 'success' && (
            <button
              onClick={handleBack}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h1 className="text-2xl font-semibold text-gray-800">Make a Deposit</h1>
        </div>
      </div>

      <div className="mx-auto px-6 py-8">
        {step === 'method' && <DepositMethodSelection onSelect={handleMethodSelect} />}
        
        {step === 'details' && (
          <DepositDetailsForm
            formData={formData}
            onUpdate={handleUpdateFormData}
            onContinue={handleContinue}
          />
        )}
        
        {step === 'confirm' && (
          <DepositConfirmation formData={formData} onConfirm={handleConfirm} />
        )}
        
        {step === 'success' && (
          <DepositSuccess
            onTrackDeposit={handleTrackDeposit}
            onBackToDashboard={handleBackToDashboard}
          />
        )}
      </div>
    </div>
  );
};

export default DepositsCreate;
