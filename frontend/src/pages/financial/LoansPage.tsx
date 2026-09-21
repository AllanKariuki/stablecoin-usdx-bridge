import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import LoanCard from '../../components/financial/loans/LoanCard';

/**
 * Loans & Credit Management Page
 * Displays all loans with payment tracking
 */
const LoansPage = () => {
  const [loans] = React.useState([
    {
      id: 'loan-001',
      loanNumber: 'LOAN-2023-001',
      type: 'home' as const,
      lender: 'National Bank',
      principal: 10000000,
      currentBalance: 8500000,
      interestRate: 5.5,
      loanTerm: 360,
      monthlyPayment: 56843,
      startDate: new Date('2023-01-15'),
      endDate: new Date('2053-01-15'),
      status: 'active' as const,
      nextPaymentDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
      lastPaymentDate: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      paymentsCompleted: 24,
      paymentsRemaining: 336,
      totalInterestPaid: 1500000,
      totalInterestRemaining: 12843480
    }
  ]);

  const totalBalance = loans.reduce((sum, loan) => sum + loan.currentBalance, 0);
  const avgInterestRate = (loans.reduce((sum, loan) => sum + loan.interestRate, 0) / loans.length).toFixed(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/enhanced-dashboard" className="text-slate-600 hover:text-slate-900">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Loans & Credit</h1>
                <p className="text-slate-600 text-sm mt-1">Manage your loans and payments</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" />
              Apply Loan
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Active Loans</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{loans.length}</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Total Balance</p>
            <p className="text-3xl font-bold text-red-600 mt-2">${(totalBalance / 1000000).toFixed(1)}M</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Avg Interest Rate</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">{avgInterestRate}%</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Next Payment</p>
            <p className="text-3xl font-bold text-blue-600 mt-2">$56.8K</p>
          </div>
        </div>

        {/* Loans List */}
        <div className="space-y-4">
          {loans.length > 0 ? (
            loans.map((loan) => (
              <LoanCard
                key={loan.id}
                loan={loan}
                onView={() => console.log('View loan', loan.id)}
                onPay={() => console.log('Pay loan', loan.id)}
                onPrepay={() => console.log('Prepay loan', loan.id)}
              />
            ))
          ) : (
            <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
              <p className="text-slate-600">No loans found</p>
              <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium">
                Apply for a loan
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default LoansPage;