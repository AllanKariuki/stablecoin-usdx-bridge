import React from 'react';

interface Recipient {
  id: string;
  name: string;
  type: 'individual' | 'business' | 'account';
  account: string;
  avatar?: string;
}

interface PaymentReviewProps {
  recipient: Recipient;
  amount: number;
  description: string;
  onConfirm: () => void;
}

const PaymentReview: React.FC<PaymentReviewProps> = ({
  recipient,
  amount,
  description,
  onConfirm,
}) => {
  const fee = (amount * 0.01).toFixed(2);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-gray-800 mb-2">Review Payment</h2>
        <p className="text-gray-600">Please verify all details before sending</p>
      </div>

      <div className="space-y-4">
        <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
          <div className="pb-4 border-b border-gray-200">
            <p className="text-sm text-gray-600 mb-2">Sending to</p>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white font-semibold">
                {recipient.name.charAt(0)}
              </div>
              <div>
                <p className="font-semibold text-gray-800">{recipient.name}</p>
                <p className="text-sm text-gray-600">{recipient.account}</p>
              </div>
            </div>
          </div>

          <div className="flex justify-between pb-4 border-b border-gray-200">
            <span className="text-gray-600">Amount</span>
            <span className="font-semibold text-gray-800">${amount.toFixed(2)}</span>
          </div>

          <div className="flex justify-between pb-4 border-b border-gray-200">
            <span className="text-gray-600">Fee</span>
            <span className="font-semibold text-gray-800">${fee}</span>
          </div>

          <div className="flex justify-between">
            <span className="font-semibold text-gray-800">Total</span>
            <span className="font-bold text-lg text-gray-800">${(amount + parseFloat(fee)).toFixed(2)}</span>
          </div>
        </div>

        {description && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-gray-600 mb-1">Note</p>
            <p className="text-gray-800 font-medium">{description}</p>
          </div>
        )}
      </div>

      <button
        onClick={onConfirm}
        className="w-full px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
      >
        Send Money
      </button>
    </div>
  );
};

export default PaymentReview;
