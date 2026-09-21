import React from 'react';
import { Shield, Calendar, DollarSign, AlertCircle } from 'lucide-react';
import type { InsurancePolicy } from '@/types/financial';

interface InsurancePolicyCardProps {
  policy: InsurancePolicy;
  onView?: (policyId: string) => void;
  onRenew?: (policyId: string) => void;
  onClaim?: (policyId: string) => void;
}

/**
 * InsurancePolicyCard Component
 * Displays insurance policy information with quick actions
 * 
 * Features:
 * - Policy type and coverage level display
 * - Premium and coverage amounts
 * - Expiry status with warning indicators
 * - Quick action buttons (View, Renew, Claim)
 * - Status badges (ACTIVE, PENDING, EXPIRED, etc.)
 */
const InsurancePolicyCard: React.FC<InsurancePolicyCardProps> = ({
  policy,
  onView,
  onRenew,
  onClaim,
}) => {
  const daysUntilExpiry = Math.ceil(
    (new Date(policy.expiryDate).getTime() - new Date().getTime()) / 
    (1000 * 60 * 60 * 24)
  );
  const isExpiringSoon = daysUntilExpiry <= 30 && daysUntilExpiry > 0;
  const isExpired = daysUntilExpiry <= 0;

  const statusColors = {
    ACTIVE: 'bg-green-100 text-green-800',
    PENDING: 'bg-yellow-100 text-yellow-800',
    EXPIRED: 'bg-red-100 text-red-800',
    CANCELLED: 'bg-gray-100 text-gray-800',
    SUSPENDED: 'bg-orange-100 text-orange-800',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-100 rounded-lg">
            <Shield className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{policy.type}</h3>
            <p className="text-sm text-gray-500">{policy.provider}</p>
          </div>
        </div>
        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${statusColors[policy.status]}`}>
          {policy.status}
        </span>
      </div>

      {/* Policy Details Grid */}
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide">Premium Amount</p>
          <p className="text-lg font-bold text-gray-900">
            ${(policy.premiumAmount / 100).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">{policy.premiumFrequency}</p>
        </div>

        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide">Coverage Amount</p>
          <p className="text-lg font-bold text-gray-900">
            ${(policy.coverageAmount / 100).toFixed(2)}
          </p>
          <p className="text-xs text-gray-500">{policy.coverageType}</p>
        </div>

        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide">Deductible</p>
          <p className="text-lg font-bold text-gray-900">
            ${(policy.deductible / 100).toFixed(2)}
          </p>
        </div>

        <div className="bg-gray-50 p-3 rounded">
          <p className="text-xs text-gray-600 uppercase tracking-wide">Expiry Date</p>
          <p className="text-lg font-bold text-gray-900">
            {new Date(policy.expiryDate).toLocaleDateString()}
          </p>
          {isExpiringSoon && (
            <p className="text-xs text-orange-600 font-semibold mt-1">
              Expires in {daysUntilExpiry} days
            </p>
          )}
        </div>
      </div>

      {/* Warning Banner */}
      {isExpired && (
        <div className="bg-red-50 border border-red-200 rounded p-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-900">Policy Expired</p>
            <p className="text-xs text-red-700">Your coverage has ended. Please renew immediately.</p>
          </div>
        </div>
      )}

      {isExpiringSoon && !isExpired && (
        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-4 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-yellow-900">Renewal Coming Soon</p>
            <p className="text-xs text-yellow-700">Your policy will expire in {daysUntilExpiry} days.</p>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 pt-4 border-t border-gray-200">
        <button
          onClick={() => onView?.(policy.id)}
          className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          View Details
        </button>
        {policy.status !== 'EXPIRED' && (
          <button
            onClick={() => onClaim?.(policy.id)}
            className="flex-1 px-4 py-2 text-sm font-medium text-green-600 hover:bg-green-50 rounded transition-colors"
          >
            File Claim
          </button>
        )}
        {(policy.status === 'EXPIRED' || isExpiringSoon) && (
          <button
            onClick={() => onRenew?.(policy.id)}
            className="flex-1 px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Renew
          </button>
        )}
      </div>
    </div>
  );
};

export default InsurancePolicyCard;
