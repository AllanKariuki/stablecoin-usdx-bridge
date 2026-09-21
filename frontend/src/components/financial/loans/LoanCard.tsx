import React from 'react';
import { CreditCard, Calendar, DollarSign, TrendingDown } from 'lucide-react';
import type { Loan } from '@/types/financial';

interface LoanCardProps {
  loan: Loan;
  onView?: (loanId: string) => void;
  onPayment?: (loanId: string) => void;
  onPrepayment?: (loanId: string) => void;
}

/**
 * LoanCard Component
 * Displays loan details with amortization and payment information
 * 
 * Features:
 * - Principal and current balance
 * - Interest rate and remaining tenure
 * - Next payment details
 * - Payment schedule progress
 * - Quick actions for payments and prepayment
 */
const LoanCard: React.FC<LoanCardProps> = ({
  loan,
  onView,
  onPayment,
  onPrepayment,
}) => {
  const monthsRemaining = loan.tenure;
  const remainingPercentage = (loan.currentBalance / loan.principalAmount) * 100;
  const paidPercentage = 100 - remainingPercentage;

  const statusColors = {
    PENDING: 'bg-yellow-100 text-yellow-800',
    APPROVED: 'bg-blue-100 text-blue-800',
    ACTIVE: 'bg-green-100 text-green-800',
    CLOSED: 'bg-gray-100 text-gray-800',
    DEFAULTED: 'bg-red-100 text-red-800',
  };

  const loanTypeColors: Record<string, string> = {
    PERSONAL: 'bg-purple-100 text-purple-600',
    HOME: 'bg-blue-100 text-blue-600',
    AUTO: 'bg-red-100 text-red-600',
    STUDENT: 'bg-green-100 text-green-600',
    BUSINESS: 'bg-indigo-100 text-indigo-600',
    LINE_OF_CREDIT: 'bg-pink-100 text-pink-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 flex-1">
          <div className={`p-3 rounded-lg ${loanTypeColors[loan.type] || loanTypeColors.PERSONAL}`}>
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">{loan.type} Loan</h3>
            <p className="text-sm text-gray-600">{loan.lender}</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${statusColors[loan.status]}`}>
          {loan.status}
        </span>
      </div>

      {/* Loan Numbers */}
      <div className="mb-4 pb-4 border-b border-gray-200">
        <p className="text-xs text-gray-600 mb-1">Loan Number</p>
        <p className="font-mono text-sm text-gray-900">{loan.loanNumber}</p>
      </div>

      {/* Principal & Balance */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Principal Amount</p>
          <p className="text-lg font-bold text-gray-900">
            ${(loan.principalAmount / 100).toFixed(2)}
          </p>
        </div>
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Current Balance</p>
          <p className="text-lg font-bold text-gray-900">
            ${(loan.currentBalance / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Loan Progress */}
      <div className="mb-4 p-3 bg-blue-50 rounded-lg">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-600 font-semibold">Loan Progress</span>
          <span className="text-xs text-blue-700 font-bold">{paidPercentage.toFixed(0)}% Paid</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-green-600 h-2 rounded-full" style={{ width: `${paidPercentage}%` }} />
        </div>
        <p className="text-xs text-gray-600 mt-2">
          Remaining: {monthsRemaining} months
        </p>
      </div>

      {/* Interest & Maturity */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Interest Rate</p>
          <p className="text-lg font-bold text-gray-900">
            {loan.interestRate.toFixed(2)}%
          </p>
          <p className="text-xs text-gray-500">{loan.interestType}</p>
        </div>
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Maturity Date</p>
          <p className="text-lg font-bold text-gray-900">
            {new Date(loan.maturityDate).toLocaleDateString()}
          </p>
        </div>
      </div>

      {/* Total Interest */}
      <div className="mb-4 p-3 bg-orange-50 rounded-lg">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Interest Payable</p>
            <p className="font-bold text-orange-700">
              ${(loan.totalInterestPayable / 100).toFixed(2)}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600 mb-1">Total Paid</p>
            <p className="font-bold text-gray-900">
              ${(loan.totalPaid / 100).toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Next Payment */}
      {loan.nextPaymentDueDate && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex items-start gap-2">
            <Calendar className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-xs text-gray-600 mb-1">Next Payment Due</p>
              <p className="font-bold text-gray-900">
                {new Date(loan.nextPaymentDueDate).toLocaleDateString()}
              </p>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-yellow-200">
                <span className="text-xs text-gray-600">Payment Amount</span>
                <span className="font-bold text-yellow-700">
                  ${(loan.nextPaymentAmount / 100).toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-gray-200">
        <button
          onClick={() => onView?.(loan.id)}
          className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          View Details
        </button>
        {loan.status === 'ACTIVE' && (
          <>
            <button
              onClick={() => onPayment?.(loan.id)}
              className="flex-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors flex items-center justify-center gap-2"
            >
              <DollarSign className="w-4 h-4" />
              Pay Now
            </button>
            <button
              onClick={() => onPrepayment?.(loan.id)}
              className="flex-1 px-4 py-2 text-sm font-medium border border-green-600 text-green-600 rounded hover:bg-green-50 transition-colors flex items-center justify-center gap-2"
            >
              <TrendingDown className="w-4 h-4" />
              Prepay
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default LoanCard;
