/**
 * ReserveStatusBanner Component
 * Shows USD-X reserve status and transparency info
 */

import { Shield, ExternalLink } from 'lucide-react';
import type { ReserveStatus } from '../../types/conversion';

interface ReserveStatusBannerProps {
  reserveStatus: ReserveStatus;
  className?: string;
}

export default function ReserveStatusBanner({
  reserveStatus,
  className = '',
}: ReserveStatusBannerProps) {
  const isHealthy = reserveStatus.reserveRatio >= 1.0;

  return (
    <div
      className={`p-4 border rounded-lg ${
        isHealthy
          ? 'bg-green-50 border-green-200'
          : 'bg-yellow-50 border-yellow-200'
      } ${className}`}
    >
      <div className="flex items-start gap-3">
        <Shield
          className={`w-5 h-5 mt-0.5 ${
            isHealthy ? 'text-green-600' : 'text-yellow-600'
          }`}
        />
        <div className="flex-1">
          <h3
            className={`font-semibold mb-1 ${
              isHealthy ? 'text-green-900' : 'text-yellow-900'
            }`}
          >
            USD-X Reserve Status
          </h3>

          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <p
                className={`text-xs ${
                  isHealthy ? 'text-green-700' : 'text-yellow-700'
                }`}
              >
                Reserve Ratio
              </p>
              <p
                className={`text-lg font-bold ${
                  isHealthy ? 'text-green-900' : 'text-yellow-900'
                }`}
              >
                {(reserveStatus.reserveRatio * 100).toFixed(2)}%
              </p>
            </div>
            <div>
              <p
                className={`text-xs ${
                  isHealthy ? 'text-green-700' : 'text-yellow-700'
                }`}
              >
                Total Reserves
              </p>
              <p
                className={`text-lg font-bold ${
                  isHealthy ? 'text-green-900' : 'text-yellow-900'
                }`}
              >
                ${reserveStatus.totalReserves.toLocaleString()}
              </p>
            </div>
          </div>

          <p
            className={`text-sm mb-2 ${
              isHealthy ? 'text-green-700' : 'text-yellow-700'
            }`}
          >
            {reserveStatus.totalSupply.toLocaleString()} USD-X in circulation
            backed by ${reserveStatus.totalReserves.toLocaleString()} in
            reserves
          </p>

          {/* Reserve Composition */}
          <div className="mb-3">
            <p
              className={`text-xs font-medium mb-1 ${
                isHealthy ? 'text-green-700' : 'text-yellow-700'
              }`}
            >
              Reserve Composition:
            </p>
            <div className="flex gap-3 text-xs">
              <span
                className={isHealthy ? 'text-green-600' : 'text-yellow-600'}
              >
                Cash: $
                {reserveStatus.composition.cash.toLocaleString()}
              </span>
              <span
                className={isHealthy ? 'text-green-600' : 'text-yellow-600'}
              >
                Equivalents: $
                {reserveStatus.composition.cashEquivalents.toLocaleString()}
              </span>
              <span
                className={isHealthy ? 'text-green-600' : 'text-yellow-600'}
              >
                T-Bills: $
                {reserveStatus.composition.treasuryBills.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Proof of Reserves Link */}
          {reserveStatus.proofOfReserves && (
            <a
              href={reserveStatus.proofOfReserves}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex items-center gap-1 text-sm font-medium underline hover:no-underline ${
                isHealthy
                  ? 'text-green-600 hover:text-green-800'
                  : 'text-yellow-600 hover:text-yellow-800'
              }`}
            >
              View Proof of Reserves
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          {/* Last Reconciliation */}
          <p
            className={`text-xs mt-2 ${
              isHealthy ? 'text-green-600' : 'text-yellow-600'
            }`}
          >
            Last reconciliation:{' '}
            {new Date(reserveStatus.lastReconciliation).toLocaleString()}
          </p>
        </div>
      </div>
    </div>
  );
}
