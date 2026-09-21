import React, { useState } from 'react';
import { Zap, AlertCircle, Check, X, Smartphone } from 'lucide-react';

type PaymentStep = 'idle' | 'setup' | 'ready' | 'waiting' | 'processing' | 'success' | 'error';

interface NFCPayment {
  reference: string;
  amount: number;
  currency: string;
  merchant: string;
  timestamp: Date;
}

const TapToPay: React.FC = () => {
  const [step, setStep] = useState<PaymentStep>('idle');
  const [nfcEnabled, setNfcEnabled] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [lastPayment, setLastPayment] = useState<NFCPayment | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleEnableNFC = async () => {
    setStep('setup');
    // Simulate NFC setup
    await new Promise(resolve => setTimeout(resolve, 1500));
    
    // Check if device supports NFC
    if ('NDEFReader' in window) {
      setNfcEnabled(true);
      setStep('ready');
    } else {
      setError('Your device does not support NFC');
      setStep('error');
    }
  };

  const handleStartPayment = () => {
    if (!paymentAmount || parseFloat(paymentAmount) <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    
    setStep('waiting');
    setError(null);
    
    // Simulate waiting for NFC tap
    const timeout = setTimeout(() => {
      setStep('processing');
      
      // Simulate payment processing
      setTimeout(() => {
        const payment: NFCPayment = {
          reference: `NFC-${Date.now()}`,
          amount: parseFloat(paymentAmount),
          currency: 'KES',
          merchant: 'Merchant Terminal',
          timestamp: new Date()
        };
        setLastPayment(payment);
        setStep('success');
        
        // Reset after success
        setTimeout(() => {
          setPaymentAmount('');
          setStep('ready');
        }, 3000);
      }, 2000);
    }, 4000);

    return () => clearTimeout(timeout);
  };

  const handleCancel = () => {
    setStep('ready');
    setError(null);
    setPaymentAmount('');
  };

  const handleDisableNFC = () => {
    setNfcEnabled(false);
    setStep('idle');
    setPaymentAmount('');
  };

  const renderContent = () => {
    switch (step) {
      case 'idle':
        return (
          <div className="text-center py-12">
            <div className="mb-6 flex justify-center">
              <div className="relative w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center">
                <Zap className="w-12 h-12 text-blue-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Tap to Pay (NFC)</h3>
            <p className="text-gray-600 mb-6">
              Use NFC (Near Field Communication) for fast, contactless payments
            </p>
            <button
              onClick={handleEnableNFC}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Enable NFC Payments
            </button>
          </div>
        );

      case 'setup':
        return (
          <div className="text-center py-12">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center animate-pulse">
                <Zap className="w-10 h-10 text-blue-600" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Setting up NFC...</h3>
            <p className="text-gray-600">Initializing your device</p>
          </div>
        );

      case 'ready':
        return (
          <div className="space-y-6">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3">
              <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-green-900">NFC Ready</p>
                <p className="text-sm text-green-800">Your device is ready for NFC payments</p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-gray-900">Payment Amount</label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="Enter amount"
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <select className="px-4 py-3 border border-gray-300 rounded-lg bg-white">
                  <option>KES</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <button
                onClick={handleStartPayment}
                disabled={!paymentAmount}
                className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5" />
                Ready to Tap
              </button>
              <button
                onClick={handleDisableNFC}
                className="w-full px-4 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Disable NFC
              </button>
            </div>

            {lastPayment && (
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm font-semibold text-gray-900 mb-3">Last Payment</p>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Amount:</span>
                    <span className="font-semibold">{lastPayment.amount} {lastPayment.currency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Reference:</span>
                    <span className="font-mono text-xs">{lastPayment.reference}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Time:</span>
                    <span>{lastPayment.timestamp.toLocaleTimeString()}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        );

      case 'waiting':
        return (
          <div className="text-center py-12">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
                <Zap className="w-12 h-12 text-blue-600 animate-bounce" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Waiting for NFC tap...</h3>
            <p className="text-gray-600 mb-2">Bring your card or device close to the reader</p>
            <p className="text-2xl font-bold text-blue-600 mb-6">{paymentAmount} KES</p>
            <button
              onClick={handleCancel}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
            >
              Cancel
            </button>
          </div>
        );

      case 'processing':
        return (
          <div className="text-center py-12">
            <div className="mb-6 flex justify-center">
              <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center animate-spin">
                <Smartphone className="w-12 h-12 text-blue-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Processing Payment</h3>
            <p className="text-gray-600">Please wait while we process your payment</p>
          </div>
        );

      case 'success':
        return (
          <div className="text-center py-12">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center">
                <Check className="w-10 h-10 text-green-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Payment Successful</h3>
            <p className="text-gray-600 mb-2">Payment of {paymentAmount} KES completed</p>
            {lastPayment && (
              <p className="text-sm text-gray-500">Reference: {lastPayment.reference}</p>
            )}
          </div>
        );

      case 'error':
        return (
          <div className="text-center py-12">
            <div className="mb-6 flex justify-center">
              <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                <X className="w-10 h-10 text-red-600" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">Error</h3>
            <p className="text-gray-600 mb-6">{error}</p>
            <button
              onClick={handleEnableNFC}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              Try Again
            </button>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="w-full">
      {renderContent()}

      {/* Info Box */}
      {(step === 'idle' || step === 'ready') && (
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold mb-1">Requirements</p>
              <ul className="list-disc list-inside space-y-1">
                <li>Your device must have NFC capability</li>
                <li>NFC must be enabled in device settings</li>
                <li>This feature requires the DAMP app on your device</li>
                <li>Payments are processed instantly</li>
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TapToPay;
