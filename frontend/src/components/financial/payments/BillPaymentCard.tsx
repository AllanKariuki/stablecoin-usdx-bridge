import React from 'react';
import { Calendar, FileText, Clock, CheckCircle } from 'lucide-react';
import type { Bill } from '../../../types/financial';

interface BillPaymentCardProps {
  bill: Bill;
  onPay?: (billId: string) => void;
  onSchedule?: (billId: string) => void;
  onViewDetails?: (billId: string) => void;
}

/**
 * BillPaymentCard Component
 * Displays bill information with payment options
 * 
 * Features:
 * - Biller logo and information
 * - Amount due and payment status
 * - Due date with visual indicators
 * - Auto-pay toggle option
 * - Quick pay and schedule payment actions
 * - Payment history summary
 */
const BillPaymentCard: React.FC<BillPaymentCardProps> = ({
  bill,
  onPay,
  onSchedule,
  onViewDetails,
}) => {
  const daysUntilDue = Math.ceil(
    (new Date(bill.dueDate).getTime() - new Date().getTime()) / 
    (1000 * 60 * 60 * 24)
  );
  const isOverdue = daysUntilDue < 0;
  const isDueSoon = daysUntilDue <= 3 && daysUntilDue >= 0;
  const isPaid = bill.status === 'PAID';

  const statusColors = {
    UNPAID: 'bg-red-100 text-red-800',
    PARTIALLY_PAID: 'bg-yellow-100 text-yellow-800',
    PAID: 'bg-green-100 text-green-800',
    OVERDUE: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
  };

  const categoryColors: Record<string, string> = {
    UTILITIES: 'bg-blue-100 text-blue-600',
    TELECOM: 'bg-purple-100 text-purple-600',
    INSURANCE: 'bg-yellow-100 text-yellow-600',
    SUBSCRIPTION: 'bg-pink-100 text-pink-600',
    RENT: 'bg-indigo-100 text-indigo-600',
    LOAN: 'bg-red-100 text-red-600',
    EDUCATION: 'bg-green-100 text-green-600',
    HEALTHCARE: 'bg-emerald-100 text-emerald-600',
    OTHER: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          {bill.billerLogo ? (
            <img
              src={bill.billerLogo}
              alt={bill.billerName}
              className="w-12 h-12 rounded-lg object-cover"
            />
          ) : (
            <div className={`w-12 h-12 rounded-lg flex items-center justify-center font-semibold ${categoryColors[bill.category] || categoryColors.OTHER}`}>
              {bill.billerName.charAt(0)}
            </div>
          )}
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900">{bill.billerName}</h3>
            <p className="text-xs text-gray-500">{bill.category}</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[bill.status]}`}>
          {bill.status}
        </span>
      </div>

      {/* Amount Section */}
      <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-lg p-4 mb-4">
        <div className="flex justify-between items-baseline mb-2">
          <span className="text-sm text-gray-600">Amount Due</span>
          {bill.isAutoPay && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
              Auto-pay: ${(bill.autoPaidAmount || 0 / 100).toFixed(2)}
            </span>
          )}
        </div>
        <div className="text-3xl font-bold text-gray-900 mb-2">
          ${(bill.amount / 100).toFixed(2)}
        </div>
        {bill.remainingBalance > 0 && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600">Remaining Balance</span>
            <span className="font-semibold text-gray-900">
              ${(bill.remainingBalance / 100).toFixed(2)}
            </span>
          </div>
        )}
        {bill.paidAmount > 0 && !isPaid && (
          <div className="mt-3 bg-green-50 rounded p-2">
            <p className="text-xs text-green-700">
              Paid: ${(bill.paidAmount / 100).toFixed(2)}
            </p>
          </div>
        )}
      </div>

      {/* Due Date Section */}
      <div className="flex items-center gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <Calendar className="w-5 h-5 text-gray-400" />
        <div>
          <p className="text-xs text-gray-600">Due Date</p>
          <p className="font-semibold text-gray-900">
            {new Date(bill.dueDate).toLocaleDateString()}
          </p>
        </div>
        {isOverdue && (
          <span className="ml-auto px-3 py-1 bg-red-100 text-red-800 text-xs font-semibold rounded-full">
            {Math.abs(daysUntilDue)} days overdue
          </span>
        )}
        {isDueSoon && !isPaid && (
          <span className="ml-auto px-3 py-1 bg-yellow-100 text-yellow-800 text-xs font-semibold rounded-full">
            Due in {daysUntilDue} days
          </span>
        )}
      </div>

      {/* Payment History */}
      {bill.paymentHistory && bill.paymentHistory.length > 0 && (
        <div className="mb-4 p-3 bg-gray-50 rounded-lg">
          <p className="text-xs text-gray-600 mb-2">Payment History</p>
          <div className="space-y-1">
            {bill.paymentHistory.slice(-2).map((payment) => (
              <div key={payment.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-600">
                  {new Date(payment.paidAt).toLocaleDateString()}
                </span>
                <span className="font-semibold text-gray-900">
                  ${(payment.amount / 100).toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-gray-200">
        {!isPaid && (
          <>
            <button
              onClick={() => onPay?.(bill.id)}
              className="flex-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Pay Now
            </button>
            <button
              onClick={() => onSchedule?.(bill.id)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-blue-600 text-blue-600 rounded hover:bg-blue-50 transition-colors flex items-center justify-center gap-2"
            >
              <Clock className="w-4 h-4" />
              Schedule
            </button>
          </>
        )}
        {isPaid && (
          <button
            onClick={() => onViewDetails?.(bill.id)}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 transition-colors flex items-center justify-center gap-2"
          >
            <CheckCircle className="w-4 h-4 text-green-600" />
            View Receipt
          </button>
        )}
      </div>
    </div>
  );
};

export default BillPaymentCard;
