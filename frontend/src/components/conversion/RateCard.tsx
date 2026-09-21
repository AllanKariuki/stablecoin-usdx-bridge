/**
 * RateCard Component
 * Displays exchange rate information and quote details
 */

import React, { useEffect, useState } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import type { ConversionQuote } from '../../types/conversion';

interface RateCardProps {
  /** Quote data to display */
  quote: ConversionQuote;
  /** Optional CSS class */
  className?: string;
  /** Callback when quote expires */
  onExpire?: () => void;
}

/**
 * RateCard - Displays exchange rate and quote details with countdown
 *
 * @example
 * ```tsx
 * <RateCard
 *   quote={quote}
 *   onExpire={() => refetchQuote()}
 * />
 * ```
 */
const RateCard: React.FC<RateCardProps> = ({ quote, className = '', onExpire }) => {
  const [timeRemaining, setTimeRemaining] = useState<string>('');
  
  useEffect(() => {
    const updateCountdown = () => {
      const now = Date.now();
      const expiresAt = new Date(quote.expiresAt).getTime();
      const remaining = Math.max(0, expiresAt - now);

      if (remaining === 0) {
        setTimeRemaining('Expired');
        onExpire?.();
      } else {
        const minutes = Math.floor(remaining / 60000);
        const seconds = Math.floor((remaining % 60000) / 1000);
        setTimeRemaining(`${minutes}:${seconds.toString().padStart(2, '0')}`);
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);
    return () => clearInterval(interval);
  }, [quote?.expiresAt, onExpire]);

  const isExpired = timeRemaining === 'Expired';

  // Guard against undefined or invalid quote
  if (!quote || !quote.fromAmount || !quote.toAmount || !quote.fees) {
    return (
      <div className={`bg-red-50 border border-red-200 rounded-lg p-6 ${className}`}>
        <p className="text-red-700">Invalid quote data</p>
      </div>
    );
  }

  return (
    <div
      className={`bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-lg p-6 ${className}`}
    >
      <div className="flex items-start justify-between mb-6">
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Exchange Rate</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-gray-900">{quote.exchangeRate}</span>
            <span className="text-sm text-gray-600">
              1 {quote.fromCurrency} = {quote.exchangeRate} {quote.toCurrency}
            </span>
          </div>
        </div>

        {!isExpired && (
          <div
            className={`flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${
              timeRemaining.includes(':')
                ? 'bg-green-100 text-green-700'
                : 'bg-red-100 text-red-700'
            }`}
          >
            <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
            {timeRemaining}
          </div>
        )}
      </div>

      {/* Conversion Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6 pb-6 border-b border-blue-200">
        <div>
          <p className="text-xs text-gray-600 mb-1">You Send</p>
          <p className="text-lg font-bold text-gray-900">
            {quote.fromAmount.toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            {quote.fromCurrency}
          </p>
        </div>
        <div className="flex items-center justify-center">
          <div className="text-2xl text-gray-400">→</div>
        </div>
        <div>
          <p className="text-xs text-gray-600 mb-1">You Receive</p>
          <p className="text-lg font-bold text-green-600">
            {quote.toAmount.toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            {quote.toCurrency}
          </p>
        </div>
      </div>

      {/* Fee Breakdown */}
      <div className="space-y-2 mb-4">
        {/* Processing Fee - always shown */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Processing Fee</span>
          <span className="text-gray-900 font-medium">{quote.fees.processingFee}%</span>
        </div>

        {/* Conversion Fee - always shown */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600">Conversion Fee</span>
          <span className="text-gray-900 font-medium">{quote.fees.conversionFee}%</span>
        </div>

        {/* Network Fee - only for crypto */}
        {quote.fees.networkFee !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Network Fee</span>
            <span className="text-gray-900 font-medium">
              ${quote.fees.networkFee.toFixed(2)}
            </span>
          </div>
        )}

        {/* Liquidity Provider Fee - only for certain routes */}
        {quote.fees.liquidityProviderFee !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Liquidity Provider Fee</span>
            <span className="text-gray-900 font-medium">
              {quote.fees.liquidityProviderFee}%
            </span>
          </div>
        )}

        {/* Bank Fee - only for fiat */}
        {quote.fees.bankFee !== undefined && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Bank Fee</span>
            <span className="text-gray-900 font-medium">
              ${quote.fees.bankFee.toFixed(2)}
            </span>
          </div>
        )}

        <div className="pt-2 border-t border-blue-200 flex items-center justify-between">
          <span className="font-semibold text-gray-900">Total Fees</span>
          <span className="font-bold text-red-600">
            {quote.totalFees.toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            {quote.fromCurrency}
          </span>
        </div>
      </div>

      {/* Net Amount */}
      <div className="bg-white rounded-lg p-4 flex items-center gap-3">
        <Check className="w-5 h-5 text-green-600" />
        <div>
          <p className="text-xs text-gray-600">Net Amount After Fees</p>
          <p className="text-lg font-bold text-gray-900">
            {quote.netAmount.toLocaleString('en-US', {
              maximumFractionDigits: 2,
            })}{' '}
            {quote.toCurrency}
          </p>
        </div>
      </div>

      {isExpired && (
        <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-red-700">
            This quote has expired. Please get a new quote to continue.
          </p>
        </div>
      )}
    </div>
  );
}


export default RateCard;