import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import WalletSelection from '../../components/withdrawals/WalletSelection';
import MethodSelection from '../../components/withdrawals/MethodSelection';
import WithdrawalDetailsForm from '../../components/withdrawals/WithdrawalDetailsForm';
import SecurityVerification from '../../components/withdrawals/SecurityVerification';
import WithdrawalConfirmation from '../../components/withdrawals/WithdrawalConfirmation';
import WithdrawalSuccess from '../../components/withdrawals/WithdrawalSuccess';

type WithdrawalMethod = 'bank' | 'mobile' | 'crypto' | 'cash' | null;

interface WithdrawalFormData {
  wallet: string;
  method: WithdrawalMethod;
  amount: number;
  destinationAccount: string;
  accountHolder: string;
  pin: string;
  showPin: boolean;
}

const WithdrawalsCreate: React.FC = () => {
  const [step, setStep] = useState<'wallet' | 'method' | 'details' | 'security' | 'confirm' | 'success'>('wallet');
  const [formData, setFormData] = useState<WithdrawalFormData>({
    wallet: '',
    method: null,
    amount: 0,
    destinationAccount: '',
    accountHolder: '',
    pin: '',
    showPin: false,
  });

  const wallets = [
    { id: 'w1', name: 'Main Wallet', balance: 5234.50, currency: 'USD' },
    { id: 'w2', name: 'Savings Wallet', balance: 2100.00, currency: 'USD' },
    { id: 'w3', name: 'Trading Wallet', balance: 850.25, currency: 'USD' },
  ];

  const selectedWallet = wallets.find((w) => w.id === formData.wallet);
  const withdrawalFee = formData.amount * 0.01; // 1% fee

  const handleWalletSelect = (walletId: string) => {
    setFormData({ ...formData, wallet: walletId });
  };

  const handleMethodSelect = (method: WithdrawalMethod) => {
    setFormData({ ...formData, method });
  };

  const handleAmountChange = (amount: number) => {
    setFormData({ ...formData, amount });
  };

  const handleDestinationAccountChange = (destinationAccount: string) => {
    setFormData({ ...formData, destinationAccount });
  };

  const handleAccountHolderChange = (accountHolder: string) => {
    setFormData({ ...formData, accountHolder });
  };

  const handleMaxClick = () => {
    setFormData({ ...formData, amount: selectedWallet?.balance || 0 });
  };

  const handlePinChange = (pin: string) => {
    setFormData({ ...formData, pin });
  };

  const handleToggleShowPin = () => {
    setFormData({ ...formData, showPin: !formData.showPin });
  };

  const handleContinue = () => {
    if (step === 'wallet' && formData.wallet) {
      setStep('method');
    } else if (step === 'method' && formData.method) {
      setStep('details');
    } else if (step === 'details' && formData.amount && formData.destinationAccount && formData.accountHolder) {
      setStep('security');
    } else if (step === 'security' && formData.pin) {
      setStep('confirm');
    }
  };

  const handleSubmit = () => {
    setStep('success');
  };

  const handleBack = () => {
    if (step === 'method') setStep('wallet');
    else if (step === 'details') setStep('method');
    else if (step === 'security') setStep('details');
    else if (step === 'confirm') setStep('security');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          {step !== 'wallet' && (
            <button onClick={handleBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
              <ArrowLeft className="w-5 h-5 text-gray-600" />
            </button>
          )}
          <h1 className="text-2xl font-bold text-gray-800">Make a Withdrawal</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step 1: Select Wallet */}
        {step === 'wallet' && (
          <WalletSelection
            wallets={wallets}
            selectedWallet={formData.wallet}
            onWalletSelect={handleWalletSelect}
            onContinue={handleContinue}
          />
        )}

        {/* Step 2: Select Method */}
        {step === 'method' && (
          <MethodSelection
            selectedMethod={formData.method}
            onMethodSelect={handleMethodSelect}
            onContinue={handleContinue}
          />
        )}

        {/* Step 3: Withdrawal Details */}
        {step === 'details' && (
          <WithdrawalDetailsForm
            amount={formData.amount}
            destinationAccount={formData.destinationAccount}
            accountHolder={formData.accountHolder}
            method={formData.method}
            selectedWallet={selectedWallet}
            onAmountChange={handleAmountChange}
            onDestinationAccountChange={handleDestinationAccountChange}
            onAccountHolderChange={handleAccountHolderChange}
            onMaxClick={handleMaxClick}
            onContinue={handleContinue}
          />
        )}

        {/* Step 4: Security Verification */}
        {step === 'security' && (
          <SecurityVerification
            pin={formData.pin}
            showPin={formData.showPin}
            onPinChange={handlePinChange}
            onToggleShowPin={handleToggleShowPin}
            onContinue={handleContinue}
          />
        )}

        {/* Step 5: Confirmation */}
        {step === 'confirm' && (
          <WithdrawalConfirmation
            selectedWallet={selectedWallet}
            method={formData.method}
            amount={formData.amount}
            onSubmit={handleSubmit}
          />
        )}

        {/* Step 6: Success */}
        {step === 'success' && (
          <WithdrawalSuccess
            amount={formData.amount}
            withdrawalFee={withdrawalFee}
          />
        )}
      </div>
    </div>
  );
};

export default WithdrawalsCreate;
