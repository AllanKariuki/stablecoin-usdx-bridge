/**
 * Convert Page (Redux Version)
 * Main conversion interface using Redux slice for state management
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRightLeft, Loader, AlertCircle, TrendingUp } from 'lucide-react';
import {
  CurrencySelector,
  AmountInput,
  TransactionStepper,
  AssetTypeFilter,
  LiquidityIndicator,
  ReserveStatusBanner,
} from '../../components/conversion';
import RateCard from '../../components/conversion/RateCard';
import { useConversion } from '../../hooks/useConversionWithRedux';
import type { QuoteRequest, AssetType } from '../../types/conversion';

/**
 * Convert - Main conversion interface with Redux integration
 */
export default function ConvertRedux() {
  const navigate = useNavigate();
  const {
    currencies,
    getQuote,
    currentQuote,
    isLoadingQuote,
    quoteError,
    isLoadingCurrencies,
    kycStatus,
    checkLimits,
    reserveStatus,
    getReserveStatus,
    // reset,
  } = useConversion();

  const [fromCurrency, setFromCurrency] = useState('USD');
  const [toCurrency, setToCurrency] = useState('BTC');
  const [amount, setAmount] = useState(1000);
  const [error, setError] = useState<string>('');
  const [warning, setWarning] = useState<string>('');
  
  // Asset type filtering
  const [fromAssetType, setFromAssetType] = useState<AssetType | 'all'>('all');
  const [toAssetType, setToAssetType] = useState<AssetType | 'all'>('all');

  // Get filtered currencies
  const getFilteredCurrencies = (type: AssetType | 'all', exclude?: string) => {
    let filtered = currencies;
    if (type !== 'all') {
      filtered = currencies.filter(c => c.type === type);
    }
    if (exclude) {
      filtered = filtered.filter(c => c.code !== exclude);
    }
    return filtered;
  };

  const fromCurrencies = getFilteredCurrencies(fromAssetType, toCurrency);
  const toCurrencies = getFilteredCurrencies(toAssetType, fromCurrency);

  // Get current currency objects
  const fromCurrencyObj = currencies.find(c => c.code === fromCurrency);
  const toCurrencyObj = currencies.find(c => c.code === toCurrency);

  // Determine conversion type for UI hints
  const conversionType = fromCurrencyObj && toCurrencyObj
    ? `${fromCurrencyObj.type}_to_${toCurrencyObj.type}`
    : null;

  // Fetch reserve status for USD-X transparency
  useEffect(() => {
    if (fromCurrencyObj?.code === 'USD-X' || toCurrencyObj?.code === 'USD-X') {
      getReserveStatus();
    }
  }, [fromCurrencyObj, toCurrencyObj, getReserveStatus]);

  // Fetch quote when currencies or amount change
  useEffect(() => {
    if (amount > 0 && fromCurrency && toCurrency && fromCurrency !== toCurrency) {
      // Clear previous errors
      setError('');
      setWarning('');

      // Check KYC limits before fetching quote
      checkLimits(amount, fromCurrency).then(result => {
        if (!result.allowed) {
          setError(result.reason || 'Transaction not allowed');
          if ('upgradeRequired' in result && result.upgradeRequired) {
            setWarning('Upgrade your KYC level to increase limits');
          }
          return;
        }

        // Fetch quote with enhanced parameters
        getQuote({
          fromCurrency,
          toCurrency,
          amount,
          slippageTolerance: 0.5, // 0.5% default
        } as QuoteRequest);
      });
    }
  }, [fromCurrency, toCurrency, amount, getQuote, checkLimits]);

  // Show warnings based on conversion type
  useEffect(() => {
    if (conversionType === 'crypto_to_fiat' || conversionType === 'crypto_to_crypto') {
      setWarning('⚠️ Capital gains tax may apply to this conversion');
    } else if (conversionType === 'fiat_to_crypto') {
      setWarning('⚠️ Cryptocurrency prices are volatile and may change rapidly');
    } else if (toCurrencyObj?.code === 'USD-X') {
      setWarning('ℹ️ USD-X is backed 1:1 by fiat reserves. View Proof of Reserves below.');
    } else {
      setWarning('');
    }
  }, [conversionType, toCurrencyObj]);

  const handleSwapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
    setFromAssetType(toAssetType);
    setToAssetType(fromAssetType);
  };

  const handleContinue = () => {
    if (!currentQuote) {
      setError('Please get a valid quote first');
      return;
    }

    // Check if quote is expired
    const expiresAt = new Date(currentQuote.expiresAt);
    if (expiresAt < new Date()) {
      setError('Quote has expired. Please get a new quote.');
      return;
    }

    navigate(`/convert/quote/${currentQuote.quoteId}`);
  };

  const steps = [
    {
      id: 'quote',
      label: 'Get Quote',
      status: currentQuote ? ('completed' as const) : ('active' as const),
    },
    {
      id: 'payment',
      label: 'Payment',
      status: 'pending' as const,
    },
    {
      id: 'confirm',
      label: 'Confirm',
      status: 'pending' as const,
    },
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Currency Conversion</h1>
          <p className="text-gray-600">Convert between fiat, crypto, and stablecoins instantly</p>
        </div>

        {/* Reserve Status Banner (for USD-X) */}
        {reserveStatus && (fromCurrencyObj?.code === 'USD-X' || toCurrencyObj?.code === 'USD-X') && (
          <div className="mb-6">
            <ReserveStatusBanner reserveStatus={reserveStatus} />
          </div>
        )}

        {/* KYC Level Banner */}
        {kycStatus && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">
                  KYC Level {kycStatus.level} 
                  <span className="ml-2 text-blue-600">
                    ({kycStatus.status})
                  </span>
                </p>
                <p className="text-xs text-blue-700 mt-1">
                  Daily Limit: ${kycStatus.limits.remainingDaily?.toLocaleString()} 
                  / ${kycStatus.limits.dailyLimit.toLocaleString()}
                </p>
              </div>
              {kycStatus.level < 3 && (
                <button
                  onClick={() => navigate('/settings/kyc')}
                  className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                >
                  Upgrade Limits →
                </button>
              )}
            </div>
          </div>
        )}

        {/* Stepper */}
        <div className="mb-8 bg-white p-6 rounded-lg border border-gray-200">
          <TransactionStepper steps={steps} currentStep="quote" orientation="horizontal" />
        </div>

        {/* Loading currencies */}
        {isLoadingCurrencies && (
          <div className="mb-8 p-6 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Loader className="w-5 h-5 text-blue-600 animate-spin" />
            <p className="text-blue-700">Loading currencies...</p>
          </div>
        )}

        {/* Main card */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-8">
          <div className="space-y-6">
            {/* From currency with asset type filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">From</label>
                <AssetTypeFilter
                  value={fromAssetType}
                  onChange={setFromAssetType}
                />
              </div>
              <CurrencySelector
                currencies={fromCurrencies}
                value={fromCurrency}
                onChange={setFromCurrency}
                excludeCurrencies={[toCurrency]}
              />
            </div>

            {/* Amount input */}
            <AmountInput
              value={amount}
              onChange={setAmount}
              currency={fromCurrencyObj}
              min={1}
              max={kycStatus?.limits.singleTransactionLimit || 1000000}
              label="Amount"
              helperText={`Min: ${fromCurrencyObj?.symbol || '$'}1 | Max: ${fromCurrencyObj?.symbol || '$'}${(kycStatus?.limits.singleTransactionLimit || 1000000).toLocaleString()}`}
              showCurrency={true}
            />

            {/* Swap button */}
            <div className="flex justify-center -my-2">
              <button
                onClick={handleSwapCurrencies}
                className="p-3 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-full transition-colors"
                title="Swap currencies"
              >
                <ArrowRightLeft className="w-5 h-5" />
              </button>
            </div>

            {/* To currency with asset type filter */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-medium text-gray-700">To</label>
                <AssetTypeFilter
                  value={toAssetType}
                  onChange={setToAssetType}
                />
              </div>
              <CurrencySelector
                currencies={toCurrencies}
                value={toCurrency}
                onChange={setToCurrency}
                excludeCurrencies={[fromCurrency]}
              />
            </div>

            {/* Conversion type indicator */}
            {conversionType && (
              <div className="flex items-center gap-2 text-sm text-gray-600 bg-gray-50 p-3 rounded-lg">
                <TrendingUp className="w-4 h-4" />
                <span>
                  {conversionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Rate card */}
        {currentQuote && (
          <div className="mb-8">
            <RateCard
              quote={currentQuote}
              onExpire={() => setError('Quote expired. Please get a new quote.')}
            />
          </div>
        )}

        {/* Loading state */}
        {isLoadingQuote && (
          <div className="mb-6 p-6 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-3">
            <Loader className="w-5 h-5 text-blue-600 animate-spin" />
            <p className="text-blue-700">
              Getting best rate from multiple liquidity providers...
            </p>
          </div>
        )}

        {/* Warnings */}
        {warning && !error && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
            <p className="text-sm text-yellow-800">{warning}</p>
          </div>
        )}

        {/* Error messages */}
        {(error || quoteError) && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1">
              <p className="text-red-700 text-sm font-medium">{error || quoteError}</p>
              {warning && (
                <p className="text-red-600 text-xs mt-1">{warning}</p>
              )}
            </div>
          </div>
        )}

        {/* Liquidity & execution info */}
        {currentQuote && (
          <div className="mb-6">
            <LiquidityIndicator
              venue={currentQuote.executionVenue}
              slippage={currentQuote.slippageTolerance}
              priceImpact={currentQuote.priceImpact}
            />
          </div>
        )}

        {/* Continue button */}
        <button
          onClick={handleContinue}
          disabled={!currentQuote || isLoadingQuote || !!error}
          className={`w-full py-4 px-4 rounded-lg font-semibold transition-all ${
            currentQuote && !isLoadingQuote && !error
              ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-sm hover:shadow-md'
              : 'bg-gray-300 text-gray-600 cursor-not-allowed'
          }`}
        >
          {isLoadingQuote 
            ? 'Getting Quote...' 
            : error 
            ? 'Fix Errors to Continue'
            : 'Continue to Payment'}
        </button>

        {/* Disclaimer for crypto */}
        {(fromCurrencyObj?.type === 'crypto' || toCurrencyObj?.type === 'crypto') && (
          <p className="text-xs text-gray-500 text-center mt-4">
            Cryptocurrency investments carry risk. Prices are volatile and past performance 
            does not guarantee future results. Trade responsibly.
          </p>
        )}
      </div>
    </div>
  );
}
