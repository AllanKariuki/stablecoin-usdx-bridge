import React, { useState } from 'react';
import { ArrowLeft, CheckCircle } from 'lucide-react';

interface Merchant {
  id: string;
  name: string;
  category: string;
  accountNumber: string;
  nickname: string;
}

type PaymentStep = 'amount' | 'confirm' | 'success';

interface PaymentFlowProps {
  merchant: Merchant;
  onClose: () => void;
  onSuccess: () => void;
}

const PaymentFlow: React.FC<PaymentFlowProps> = ({ merchant, onClose, onSuccess }) => {
  const [step, setStep] = useState<PaymentStep>('amount');
  const [amount, setAmount] = useState(0);

  const fee = (amount * 0.015).toFixed(2);
  const total = (amount + parseFloat(fee)).toFixed(2);

  const handleContinue = () => {
    if (step === 'amount' && amount > 0) {
      setStep('confirm');
    }
  };

  const handleBack = () => {
    if (step === 'confirm') setStep('amount');
  };

  const handleConfirm = () => {
    setStep('success');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end sm:items-center justify-center z-50">
      <div className="bg-white w-full sm:max-w-md sm:rounded-lg rounded-t-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        {step !== 'success' && (
          <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center gap-4">
            {step !== 'amount' && (
              <button
                onClick={handleBack}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5 text-gray-600" />
              </button>
            )}
            <h2 className="text-lg font-semibold text-gray-800">
              {step === 'amount' && 'Enter Amount'}
              {step === 'confirm' && 'Confirm Payment'}
            </h2>
          </div>
        )}

        {/* Content */}
        <div className="p-6">
          {/* Step 1: Enter Amount */}
          {step === 'amount' && (
            <div className="space-y-6">
              {/* Merchant Details */}
              <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">Merchant</span>
                  <span className="font-semibold text-gray-800">{merchant.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Account</span>
                  <span className="font-semibold text-gray-800">{merchant.nickname}</span>
                </div>
              </div>

              {/* Quick Amounts */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quick amounts
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[1000, 2500, 5000, 10000].map((quick) => (
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
                    <span className="text-gray-600">Fee (1.5%):</span>
                    <span className="font-medium text-gray-800">${fee}</span>
                  </div>
                  <div className="flex justify-between text-sm font-semibold">
                    <span className="text-gray-800">Total:</span>
                    <span className="text-gray-800">${total}</span>
                  </div>
                </div>
              )}

              <button
                onClick={handleContinue}
                disabled={amount <= 0}
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                Review Payment
              </button>
            </div>
          )}

          {/* Step 2: Confirm */}
          {step === 'confirm' && (
            <div className="space-y-6">
              <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
                <div className="text-center pb-4 border-b border-gray-200">
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl">🏪</span>
                  </div>
                  <h3 className="font-semibold text-gray-800">{merchant.name}</h3>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Account</span>
                    <span className="font-semibold text-gray-800">{merchant.nickname}</span>
                  </div>
                  <div className="flex justify-between pb-3 border-b border-gray-200">
                    <span className="text-gray-600">Merchant ID</span>
                    <span className="font-semibold text-gray-800">
                      {merchant.accountNumber}
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
                    <span className="font-bold text-lg text-gray-800">${total}</span>
                  </div>
                </div>
              </div>

              <button
                onClick={handleConfirm}
                className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                Confirm Payment
              </button>
            </div>
          )}

          {/* Step 3: Success */}
          {step === 'success' && (
            <div className="text-center space-y-6 py-4">
              <div>
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800 mb-2">
                  Payment Successful!
                </h2>
                <p className="text-gray-600">Your merchant payment has been processed</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 text-left">
                <div>
                  <p className="text-sm text-gray-600">Merchant</p>
                  <p className="font-semibold text-gray-800">{merchant.name}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Reference</p>
                  <p className="font-semibold text-gray-800 font-mono">
                    MERCH-{new Date().getTime()}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Amount Paid</p>
                  <p className="font-bold text-lg text-gray-800">
                    ${amount.toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    onSuccess();
                    onClose();
                  }}
                  className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Close Button for non-success states */}
        {step !== 'success' && (
          <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-3">
            <button
              onClick={onClose}
              className="w-full px-6 py-2 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentFlow;
