import React from 'react';
import { ArrowLeft, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import InsurancePolicyCard from '../../components/financial/insurance/InsurancePolicyCard';

/**
 * Insurance Management Page
 * Displays all insurance policies with management options
 */
export default function InsurancePage() {
  const [policies] = React.useState([
    {
      id: 'policy-001',
      policyNumber: 'POL-2024-001',
      provider: 'SafeGuard Insurance',
      type: 'life' as const,
      coverageAmount: 500000,
      premium: 245000,
      premiumFrequency: 'annual' as const,
      startDate: new Date('2023-01-15'),
      expiryDate: new Date('2025-01-15'),
      status: 'active' as const,
      beneficiaries: [
        { name: 'Jane Doe', relationship: 'Spouse', percentage: 100 }
      ],
      documents: [],
      lastPremiumPaid: new Date('2024-01-15'),
      nextPremiumDue: new Date('2025-01-15')
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
                <h1 className="text-2xl font-bold text-slate-900">Insurance Policies</h1>
                <p className="text-slate-600 text-sm mt-1">Manage your insurance coverage</p>
              </div>
            </div>
            <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
              <Plus className="w-5 h-5" />
              Add Policy
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Active Policies</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">4</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Total Coverage</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">$2.5M</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Annual Premium</p>
            <p className="text-3xl font-bold text-slate-900 mt-2">$2,450</p>
          </div>
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <p className="text-slate-600 text-sm font-medium">Pending Actions</p>
            <p className="text-3xl font-bold text-orange-600 mt-2">1</p>
          </div>
        </div>

        {/* Policies List */}
        <div className="space-y-4">
          {policies.length > 0 ? (
            policies.map((policy) => (
              <InsurancePolicyCard
                key={policy.id}
                policy={policy}
                onView={() => console.log('View policy', policy.id)}
                onRenew={() => console.log('Renew policy', policy.id)}
                onClaim={() => console.log('File claim for policy', policy.id)}
              />
            ))
          ) : (
            <div className="bg-white rounded-lg p-8 text-center border border-slate-200">
              <p className="text-slate-600">No insurance policies found</p>
              <button className="mt-4 text-blue-600 hover:text-blue-700 font-medium">
                Add your first policy
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
