import React, { useState } from 'react';
import { Copy, QrCode, Share2, Download } from 'lucide-react';

interface PaymentRequestFormProps {
  onSubmit: (data: { amount: string; currency: string; description: string; dueDate: string }) => void;
}

const PaymentRequestForm: React.FC<PaymentRequestFormProps> = ({ onSubmit }) => {
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ amount, currency, description, dueDate });
  };

  return (
    <div className="bg-white rounded-lg p-6 border border-gray-200">
      <h2 className="text-lg font-bold text-gray-900 mb-6">Create Payment Request</h2>
      
      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Amount */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Amount</label>
          <div className="flex gap-2">
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option>USD</option>
              <option>EUR</option>
              <option>GBP</option>
              <option>KES</option>
              <option>NGN</option>
              <option>BTC</option>
              <option>ETH</option>
            </select>
          </div>
        </div>

        {/* Description */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Description (Optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g., Invoice #123, Consulting fees"
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Due Date */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">Due Date (Optional)</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors"
        >
          Generate Payment Request
        </button>

        {/* Preview */}
        {amount && (
          <div className="bg-gray-50 border border-gray-300 rounded-lg p-4 mt-6">
            <p className="text-sm text-gray-600 mb-3">Payment Link & QR Code</p>
            
            {/* QR Code Preview */}
            <div className="bg-white border border-gray-300 rounded-lg p-4 mb-4 flex items-center justify-center">
              <QrCode className="w-24 h-24 text-gray-400" />
            </div>

            {/* Payment Link */}
            <div className="bg-white border border-gray-300 rounded-lg p-3 flex items-center justify-between">
              <code className="text-xs text-gray-600">pay.example.com/abc123</code>
              <Copy className="w-4 h-4 text-gray-400 cursor-pointer" />
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 mt-4">
              <button
                type="button"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-2"
              >
                <Share2 className="w-4 h-4" />
                Share
              </button>
              <button
                type="button"
                className="flex-1 px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Download
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
};

export default PaymentRequestForm;
