import { useState } from 'react';
import { ArrowLeft, Plus, Filter } from 'lucide-react';
import { Link } from 'react-router-dom';
import BillPaymentCard from '../../components/financial/payments/BillPaymentCard';

/**
 * Bills & Payments Management Page
 * Displays all bills with payment options
 */
export default function BillsPage() {
  const [bills] = useState([
    {
      id: 'bill-001',
      billerId: 'biller-001',
      billerName: 'Electric Company',
      billerLogo: '⚡',
      accountNumber: 'ACC-2024-001',
      dueDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      amount: 15000,
      description: 'Monthly electricity bill',
      status: 'unpaid' as const,
      category: 'utilities' as const,
      isRecurring: true,
      frequency: 'monthly' as const,
      paymentHistory: [
        {
          id: 'payment-001',
          date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          amount: 15000,
          status: 'completed' as const
        }
      ]
    }
  ]);

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
                <h1 className="text-2xl font-bold text-slate-900">Bills & Payments</h1>
                <p className="text-slate-600 text-sm mt-1">Manage and pay your bills</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="text-slate-600 hover:text-slate-900 p-2 rounded-lg hover:bg-slate-100">
                <Filter className="w-5 h-5" />
              </button>
              <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
                <Plus className="w-5 h-5" />
                Add Bill
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Due This Month</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">3</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Total Due</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">$1,250</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Paid This Month</p>
            <p className="text-3xl font-bold text-green-600 mt-2">8</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Auto-Pay Setup</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">5</p>
          </div>
        </div>

        {/* Bills List */}
        <div className="space-y-4">
          {bills.length > 0 ? (
            bills.map((bill) => (
              <BillPaymentCard
                key={bill.id}
                bill={bill}
                onPayNow={() => console.log('Pay now', bill.id)}
                onSchedule={() => console.log('Schedule payment', bill.id)}
                onSetupAutoPay={() => console.log('Setup auto-pay', bill.id)}
              />
            ))
          ) : (
            <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
              <p className="text-slate-600">No bills found</p>
              <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium">
                Add your first bill
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
