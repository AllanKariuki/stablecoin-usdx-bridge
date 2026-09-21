import React from 'react';
import { AlertCircle, Eye, EyeOff } from 'lucide-react';

interface SecurityVerificationProps {
  pin: string;
  showPin: boolean;
  onPinChange: (pin: string) => void;
  onToggleShowPin: () => void;
  onContinue: () => void;
}

const SecurityVerification: React.FC<SecurityVerificationProps> = ({
  pin,
  showPin,
  onPinChange,
  onToggleShowPin,
  onContinue,
}) => {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Security Verification</h2>
        <p className="text-gray-600">Enter your transaction PIN to confirm</p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-yellow-800">
            A verification code has been sent to your registered email and phone.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Transaction PIN</label>
          <div className="relative">
            <input
              type={showPin ? 'text' : 'password'}
              value={pin}
              onChange={(e) => onPinChange(e.target.value)}
              placeholder="Enter 4-digit PIN"
              className="w-full px-4 py-3 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <button
              type="button"
              onClick={onToggleShowPin}
              className="absolute right-4 top-3 text-gray-400 hover:text-gray-600"
            >
              {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
        </div>

        <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
          Didn't receive code? Resend
        </button>
      </div>

      <button
        onClick={onContinue}
        disabled={pin.length < 4}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
      >
        Verify & Continue
      </button>
    </div>
  );
};

export default SecurityVerification;
