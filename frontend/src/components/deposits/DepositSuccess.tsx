import React from 'react';
import { CheckCircle } from 'lucide-react';

interface DepositSuccessProps {
  onTrackDeposit: () => void;
  onBackToDashboard: () => void;
}

const DepositSuccess: React.FC<DepositSuccessProps> = ({ onTrackDeposit, onBackToDashboard }) => {
  return (
    <div className="max-w-3xl mx-auto text-center space-y-6">
      <div>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Deposit Submitted</h2>
        <p className="text-gray-600">Your deposit request has been received</p>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6 text-left space-y-3">
        <div>
          <p className="text-sm text-gray-600">Reference Number</p>
          <p className="font-semibold text-gray-800">REF-2025011501234</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Estimated Processing Time</p>
          <p className="font-semibold text-gray-800">2-5 business days</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onTrackDeposit}
          className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Track Deposit
        </button>
        <button
          onClick={onBackToDashboard}
          className="w-full px-6 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default DepositSuccess;
