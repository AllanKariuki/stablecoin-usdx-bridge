import React from 'react';
import { CheckCircle } from 'lucide-react';

interface WithdrawalSuccessProps {
  amount: number;
  withdrawalFee: number;
}

const WithdrawalSuccess: React.FC<WithdrawalSuccessProps> = ({ amount, withdrawalFee }) => {
  return (
    <div className="text-center space-y-6">
      <div>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Withdrawal Submitted</h2>
        <p className="text-gray-600">Your withdrawal request has been processed</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-left space-y-3">
        <div>
          <p className="text-sm text-gray-600">Reference Number</p>
          <p className="font-semibold text-gray-800">WTH-2025011501234</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Amount</p>
          <p className="font-semibold text-gray-800">${(amount - withdrawalFee).toFixed(2)}</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Estimated Arrival</p>
          <p className="font-semibold text-gray-800">1-3 business days</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={() => (window.location.href = '/transactions/withdrawals')}
          className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Track Withdrawal
        </button>
        <button
          onClick={() => (window.location.href = '/dashboard')}
          className="w-full px-6 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default WithdrawalSuccess;
