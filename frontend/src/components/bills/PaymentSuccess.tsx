import React from 'react';
import { CheckCircle } from 'lucide-react';

interface PaymentSuccessProps {
  amount: number;
  onBackToDashboard: () => void;
  onPayAnother: () => void;
}

const PaymentSuccess: React.FC<PaymentSuccessProps> = ({
  amount,
  onBackToDashboard,
  onPayAnother,
}) => {
  return (
    <div className="max-w-3xl mx-auto text-center space-y-6">
      <div>
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Payment Successful!</h2>
        <p className="text-gray-600">Your bill payment has been processed</p>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4 text-left">
        <div>
          <p className="text-sm text-gray-600">Reference</p>
          <p className="font-semibold text-gray-800 font-mono">BILL-2025011501234</p>
        </div>
        <div>
          <p className="text-sm text-gray-600">Amount Paid</p>
          <p className="font-bold text-lg text-gray-800">${amount.toFixed(2)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <button
          onClick={onBackToDashboard}
          className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          Back to Dashboard
        </button>
        <button
          onClick={onPayAnother}
          className="w-full px-6 py-3 bg-white border border-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
        >
          Pay Another Bill
        </button>
      </div>
    </div>
  );
};

export default PaymentSuccess;
