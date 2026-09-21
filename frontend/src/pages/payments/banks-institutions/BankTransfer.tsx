import React, { useState } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';

export interface SavedBank {
  id: string;
  name: string;
  type: string;
  accountNumber: string;
  accountHolder: string;
  lastTransfer?: {
    amount: number;
    date: string;
  };
}

type TransferStep = 'amount' | 'confirm' | 'success';

interface BankTransferProps {
  bank: SavedBank;
  onBack: () => void;
  onTransferSuccess?: () => void;
}

const BankTransfer: React.FC<BankTransferProps> = ({
  bank,
  onBack,
  onTransferSuccess,
}) => {
  const [step, setStep] = useState<TransferStep>('amount');
  const [amount, setAmount] = useState(0);

  const fee = (amount * 0.005).toFixed(2);
  const total = (amount + parseFloat(fee)).toFixed(2);

  const handleContinue = () => {
    if (step === 'amount' && amount > 0) {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'amount') {
      onBack();
    } else if (step === 'confirm') {
      setStep('amount');
    }
  };

  const handleConfirm = () => {
    setStep('success');
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="top-0 z-10">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center gap-4">
          <button
            onClick={handleBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-2xl font-bold text-gray-800">Bank Transfer</h1>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Step 1: Enter Amount */}
        {step === 'amount' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                Enter Amount
              </h2>
              <p className="text-gray-600">How much do you want to transfer?</p>
            </div>

            <div className="space-y-4">
              {/* Bank Details */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Bank</span>
                  <span className="font-semibold text-gray-800">
                    {bank.name}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Account Holder</span>
                  <span className="font-semibold text-gray-800">
                    {bank.accountHolder}
                  </span>
                </div>
              </div>

              {/* Quick Amounts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick amounts
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[100, 500, 1000, 5000].map((quick) => (
                    <button
                      key={quick}
                      onClick={() => setAmount(quick)}
                      className={`py-2 rounded-lg font-medium transition-colors ${
                        amount === quick
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      ${quick}
                    </button>
                  ))}
                </div>
              </div>

              {/* Custom Amount */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Custom amount
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-3 text-gray-600">$</span>
                  <input
                    type="number"
                    value={amount || ''}
                    onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                    className="w-full pl-8 pr-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>

              {/* Fee Breakdown */}
              {amount > 0 && (
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-medium text-gray-800">
                      ${amount.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between text-sm pb-2 border-b border-blue-200">
                    <span className="text-gray-600">Fee (0.5%):</span>
                    <span className="font-medium text-gray-800">${fee}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-800">Total:</span>
                    <span className="text-gray-800">${total}</span>
                  </div>
                </div>
              )}
            </div>

            <button
              onClick={handleContinue}
              disabled={amount <= 0}
              className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              Review Transfer
            </button>
          </div>
        )}

        {/* Step 2: Confirm */}
        {step === 'confirm' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-gray-800 mb-2">
                Confirm Transfer
              </h2>
              <p className="text-gray-600">Review your bank transfer details</p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
              <div className="text-center pb-4 border-b border-gray-200">
                <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                  <span className="text-2xl">🏦</span>
                </div>
                <h3 className="font-semibold text-gray-800">
                  {bank.name}
                </h3>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-gray-600">Account Holder</span>
                  <span className="font-semibold text-gray-800">
                    {bank.accountHolder}
                  </span>
                </div>
                <div className="flex justify-between pb-3 border-b border-gray-200">
                  <span className="text-gray-600">Account Number</span>
                  <span className="font-semibold text-gray-800">
                    {bank.accountNumber}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Amount</span>
                  <span className="font-semibold text-gray-800">
                    ${amount.toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between pb-3 border-b border-gray-200">
                  <span className="text-gray-600">Fee</span>
                  <span className="font-semibold text-gray-800">${fee}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-semibold text-gray-800">Total</span>
                  <span className="font-bold text-lg text-gray-800">
                    ${total}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={handleConfirm}
              className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Confirm Transfer
            </button>
          </div>
        )}

        {/* Step 3: Success */}
        {step === 'success' && (
          <div className="text-center space-y-6">
            <div>
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle className="w-8 h-8 text-green-600" />
              </div>
              <h2 className="text-2xl font-bold text-gray-800 mb-2">
                Transfer Successful!
              </h2>
              <p className="text-gray-600">
                Your bank transfer has been processed
              </p>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 text-left">
              <div>
                <p className="text-sm text-gray-600">Bank</p>
                <p className="font-semibold text-gray-800">
                  {bank.name}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Reference</p>
                <p className="font-semibold text-gray-800 font-mono">
                  BANK-{new Date().getTime()}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Amount Transferred</p>
                <p className="font-bold text-lg text-gray-800">
                  ${amount.toFixed(2)}
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={() => {
                  onTransferSuccess?.();
                  onBack();
                }}
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Back to Banks
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BankTransfer;
