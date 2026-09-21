/**
 * LiquidityIndicator Component
 * Shows execution venue, slippage, and price impact info
 */

import { TrendingDown, TrendingUp, Activity } from 'lucide-react';

interface LiquidityIndicatorProps {
  venue?: string;
  slippage?: number;
  priceImpact?: number;
}

export default function LiquidityIndicator({
  venue,
  slippage,
  priceImpact,
}: LiquidityIndicatorProps) {
  const getImpactColor = (impact?: number) => {
    if (!impact) return 'text-gray-600';
    if (impact < 0.1) return 'text-green-600';
    if (impact < 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getImpactLabel = (impact?: number) => {
    if (!impact) return 'Unknown';
    if (impact < 0.1) return 'Low';
    if (impact < 0.5) return 'Medium';
    return 'High';
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        Execution Details
      </h3>

      <div className="grid grid-cols-3 gap-4">
        {/* Venue */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <Activity className="w-3 h-3 text-gray-400" />
            <p className="text-xs text-gray-600">Venue</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {venue || 'N/A'}
          </p>
        </div>

        {/* Slippage Tolerance */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <TrendingDown className="w-3 h-3 text-gray-400" />
            <p className="text-xs text-gray-600">Slippage</p>
          </div>
          <p className="text-sm font-semibold text-gray-900">
            {slippage !== undefined ? `${slippage}%` : 'N/A'}
          </p>
        </div>

        {/* Price Impact */}
        <div>
          <div className="flex items-center gap-1 mb-1">
            <TrendingUp className="w-3 h-3 text-gray-400" />
            <p className="text-xs text-gray-600">Price Impact</p>
          </div>
          <p className={`text-sm font-semibold ${getImpactColor(priceImpact)}`}>
            {getImpactLabel(priceImpact)}
            {priceImpact !== undefined && ` (${priceImpact.toFixed(2)}%)`}
          </p>
        </div>
      </div>

      {/* Warning for high impact */}
      {priceImpact !== undefined && priceImpact >= 0.5 && (
        <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
          ⚠️ High price impact. Consider splitting into smaller orders.
        </div>
      )}
    </div>
  );
}
