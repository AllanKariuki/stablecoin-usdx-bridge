import React from 'react';
import { TrendingUp, TrendingDown, BarChart3 } from 'lucide-react';
import type { Investment } from '@/types/financial';

interface InvestmentCardProps {
  investment: Investment;
  onView?: (investmentId: string) => void;
  onSell?: (investmentId: string) => void;
}

/**
 * InvestmentCard Component
 * Displays individual investment details with performance metrics
 * 
 * Features:
 * - Investment symbol and name
 * - Current price and quantity
 * - Unrealized gains/losses with percentage
 * - Visual gain/loss indicators
 * - Total investment and current value
 * - Risk level badge
 * - Quick actions for viewing and selling
 */
const InvestmentCard: React.FC<InvestmentCardProps> = ({
  investment,
  onView,
  onSell,
}) => {
  const isGain = investment.unrealizedGain >= 0;
  const gainPercentColor = isGain ? 'text-green-600' : 'text-red-600';
  const gainBgColor = isGain ? 'bg-green-50' : 'bg-red-50';
  
  const riskColors = {
    LOW: 'bg-green-100 text-green-800',
    MEDIUM: 'bg-yellow-100 text-yellow-800',
    HIGH: 'bg-orange-100 text-orange-800',
    VERY_HIGH: 'bg-red-100 text-red-800',
  };

  const typeColors: Record<string, string> = {
    STOCKS: 'bg-blue-100 text-blue-600',
    BONDS: 'bg-purple-100 text-purple-600',
    MUTUAL_FUNDS: 'bg-indigo-100 text-indigo-600',
    ETF: 'bg-cyan-100 text-cyan-600',
    FOREX: 'bg-pink-100 text-pink-600',
    COMMODITIES: 'bg-yellow-100 text-yellow-600',
    REAL_ESTATE: 'bg-amber-100 text-amber-600',
    CRYPTO: 'bg-orange-100 text-orange-600',
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-gray-900">{investment.symbol}</h3>
            <span className={`text-xs font-semibold px-2 py-1 rounded ${typeColors[investment.type] || typeColors.STOCKS}`}>
              {investment.type}
            </span>
          </div>
          <p className="text-sm text-gray-600">{investment.name}</p>
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded ${riskColors[investment.riskLevel]}`}>
          {investment.riskLevel} Risk
        </span>
      </div>

      {/* Current Price & Quantity */}
      <div className="grid grid-cols-2 gap-4 mb-4 pb-4 border-b border-gray-200">
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Current Price</p>
          <p className="text-2xl font-bold text-gray-900">
            ${(investment.currentPrice / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 uppercase tracking-wide mb-1">Quantity</p>
          <p className="text-2xl font-bold text-gray-900">
            {investment.quantity}
          </p>
        </div>
      </div>

      {/* Investment Value */}
      <div className="grid grid-cols-2 gap-4 mb-4 p-3 bg-gray-50 rounded-lg">
        <div>
          <p className="text-xs text-gray-600 mb-1">Total Investment</p>
          <p className="font-semibold text-gray-900">
            ${(investment.totalInvestment / 100).toFixed(2)}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 mb-1">Current Value</p>
          <p className="font-semibold text-gray-900">
            ${(investment.currentValue / 100).toFixed(2)}
          </p>
        </div>
      </div>

      {/* Unrealized Gains/Loss */}
      <div className={`p-3 rounded-lg mb-4 ${gainBgColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isGain ? (
              <TrendingUp className={`w-5 h-5 ${gainPercentColor}`} />
            ) : (
              <TrendingDown className={`w-5 h-5 ${gainPercentColor}`} />
            )}
            <span className="text-sm text-gray-700">Unrealized Gain/Loss</span>
          </div>
        </div>
        <p className={`text-2xl font-bold mt-2 ${gainPercentColor}`}>
          {isGain ? '+' : ''}{(investment.unrealizedGain / 100).toFixed(2)} ({isGain ? '+' : ''}{investment.unrealizedGainPercent.toFixed(2)}%)
        </p>
      </div>

      {/* Status */}
      <div className="flex items-center justify-between mb-4 text-sm">
        <span className="text-gray-600">Status</span>
        <span className={`font-semibold px-3 py-1 rounded-full text-xs ${
          investment.status === 'ACTIVE' 
            ? 'bg-green-100 text-green-800' 
            : 'bg-gray-100 text-gray-800'
        }`}>
          {investment.status}
        </span>
      </div>

      {/* Broker Info */}
      {investment.broker && (
        <div className="text-xs text-gray-600 mb-4 pb-4 border-b border-gray-200">
          <p>
            <span className="font-semibold">Broker:</span> {investment.broker}
            {investment.accountNumber && ` • ${investment.accountNumber}`}
          </p>
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        <button
          onClick={() => onView?.(investment.id)}
          className="flex-1 px-4 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50 rounded transition-colors flex items-center justify-center gap-2"
        >
          <BarChart3 className="w-4 h-4" />
          Details
        </button>
        {investment.status === 'ACTIVE' && (
          <button
            onClick={() => onSell?.(investment.id)}
            className="flex-1 px-4 py-2 text-sm font-medium border border-red-600 text-red-600 rounded hover:bg-red-50 transition-colors"
          >
            Sell
          </button>
        )}
      </div>
    </div>
  );
};

export default InvestmentCard;
