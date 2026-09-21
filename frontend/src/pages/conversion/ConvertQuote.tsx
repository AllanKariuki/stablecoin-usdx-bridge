/**
 * ConvertQuote Page
 * Quote confirmation and payment method selection
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader, Info, Fuel, FileText, Shield } from 'lucide-react';
import {
  PaymentMethodSelector,
  TransactionStepper,
  LiquidityIndicator,
} from '../../components/conversion';
import RateCard from '../../components/conversion/RateCard';
import { useConversion } from '../../hooks/useConversionWithRedux';

/**
 * ConvertQuote - Confirm quote and select payment method
 */
const ConvertQuote = () => {
  const { quoteId } = useParams<{ quoteId: string }>();
  const navigate = useNavigate();
  const {
    currentQuote,
    wallets,
    confirmConversion,
    isConfirming,
    currentTransaction,
    confirmationError,
    isLoadingQuote,
    currencies,
  } = useConversion();

  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string>('');
  const [error, setError] = useState<string>('');
  const [isValidating, setIsValidating] = useState<boolean>(true);

  // Get currency objects for additional info
  const fromCurrency = currentQuote && currencies.find(c => c.code === currentQuote.fromCurrency);
  const toCurrency = currentQuote && currencies.find(c => c.code === currentQuote.toCurrency);
  const isCryptoInvolved = fromCurrency?.type === 'crypto' || toCurrency?.type === 'crypto';

  // Validate quote exists (with delay to allow Redux state to load)
  useEffect(() => {
    // Wait for initial loading to complete
    if (isLoadingQuote) {
      return;
    }

    // Give a short grace period for state to sync
    const validationTimeout = setTimeout(() => {
      if (!currentQuote || currentQuote.quoteId !== quoteId) {
        setError('Quote not found. Please start a new conversion.');
        setTimeout(() => navigate('/convert'), 2000);
      } else {
        setIsValidating(false);
      }
    }, 300);

    return () => clearTimeout(validationTimeout);
  }, [quoteId, currentQuote, navigate, isLoadingQuote]);

  // Navigate to confirmation when transaction is created
  useEffect(() => {
    if (currentTransaction) {
      navigate(`/convert/confirm/${currentTransaction.transactionId}`);
    }
  }, [currentTransaction, navigate]);

  const handleConfirm = () => {
    if (!selectedPaymentMethod) {
      setError('Please select a payment method');
      return;
    }

    setError('');
    confirmConversion(selectedPaymentMethod);
  };

  // Show loading state while validating or loading quote
  if (isLoadingQuote || isValidating) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Loading Quote</h2>
          <p className="text-gray-600">Please wait...</p>
        </div>
      </div>
    );
  }

  if (!currentQuote) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Quote Not Found</h2>
          <p className="text-gray-600 mb-6">Redirecting to conversion page...</p>
        </div>
      </div>
    );
  }

  const steps = [
    {
      id: 'quote',
      label: 'Get Quote',
      status: 'completed' as const,
    },
    {
      id: 'payment',
      label: 'Payment',
      status: 'active' as const,
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
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Confirm Exchange</h1>
          <p className="text-gray-600">Review your quote and select a payment method</p>
        </div>

        {/* Stepper */}
        <div className="mb-8 bg-white p-6 rounded-lg border border-gray-200">
          <TransactionStepper steps={steps} currentStep="payment" orientation="horizontal" />
        </div>

        {/* Quote Summary */}
        <div className="mb-8">
          <RateCard quote={currentQuote} />
        </div>

        {/* Liquidity & Execution Info */}
        {currentQuote && (
          <div className="mb-8">
            <LiquidityIndicator
              venue={currentQuote.executionVenue}
              slippage={currentQuote.slippageTolerance}
              priceImpact={currentQuote.priceImpact}
            />
          </div>
        )}

        {/* Crypto-specific information */}
        {isCryptoInvolved && currentQuote && (
          <div className="bg-white rounded-lg border border-gray-200 p-6 mb-8">
            <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5 text-blue-600" />
              Blockchain Details
            </h2>
            
            <div className="space-y-4">
              {/* Gas estimate */}
              {currentQuote.gasEstimate && (
                <div className="pb-4 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    <Fuel className="w-5 h-5 text-orange-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">Estimated Gas Fee</p>
                      <p className="text-sm text-gray-600">
                        {currentQuote.gasEstimate.estimatedCost.toFixed(2)} USD 
                        <span className="text-gray-500 ml-2">
                          (~{currentQuote.gasEstimate.estimatedCostCrypto.toFixed(6)} {fromCurrency?.code || 'ETH'})
                        </span>
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Gas Limit: {currentQuote.gasEstimate.gasLimit.toLocaleString()} | 
                        Gas Price: {currentQuote.gasEstimate.gasPrice} Gwei
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tax implications */}
              {currentQuote.taxImplication && (
                <div className="pb-4 border-b border-gray-200">
                  <div className="flex items-start gap-3">
                    <FileText className="w-5 h-5 text-purple-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">Tax Information</p>
                      <p className="text-sm text-gray-600">
                        {currentQuote.taxImplication.capitalGain && currentQuote.taxImplication.capitalGain > 0 ? (
                          <>
                            Estimated Capital Gain: ${currentQuote.taxImplication.capitalGain.toLocaleString()}
                            <span className="ml-2 text-xs">
                              ({currentQuote.taxImplication.taxCategory?.replace('_', '-') || 'taxable'})
                            </span>
                          </>
                        ) : (
                          'No taxable event'
                        )}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        Cost Basis: ${currentQuote.taxImplication.acquisitionCostBasis?.toLocaleString() || 'N/A'} | 
                        FMV: ${currentQuote.taxImplication.fmvAtConversion.toLocaleString()}
                      </p>
                      {currentQuote.taxImplication.holdingPeriod && (
                        <p className="text-xs text-gray-500">
                          Holding Period: {currentQuote.taxImplication.holdingPeriod} days
                        </p>
                      )}
                      <p className="text-xs text-yellow-600 mt-2">
                        ⚠️ Consult a tax professional for accurate tax reporting
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Network info */}
              {(fromCurrency?.network || toCurrency?.network) && (
                <div>
                  <div className="flex items-start gap-3">
                    <Shield className="w-5 h-5 text-green-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 mb-1">Network</p>
                      <div className="text-sm text-gray-600 space-y-1">
                        {fromCurrency?.network && (
                          <p>From: {fromCurrency.network} ({fromCurrency.code})</p>
                        )}
                        {toCurrency?.network && (
                          <p>To: {toCurrency.network} ({toCurrency.code})</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Method Selection */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Select Payment Method</h2>

          {wallets.length > 0 ? (
            <>
              <PaymentMethodSelector
                methods={wallets.map((wallet) => ({
                  id: wallet.id,
                  type: 'bank_account' as const,
                  name: `${wallet.currency} Wallet`,
                  lastFour: '****',
                  isDefault: wallet.id === wallets[0].id,
                }))}
                value={selectedPaymentMethod}
                onChange={setSelectedPaymentMethod}
              />
              <p className="mt-4 text-xs text-gray-600">
                You have {wallets.length} wallet(s) available
              </p>
            </>
          ) : (
            <div className="p-6 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="w-5 h-5 text-yellow-600 mb-2" />
              <p className="text-yellow-700 font-medium mb-2">No payment methods available</p>
              <p className="text-yellow-600 text-sm mb-4">
                Please add a payment method to continue with the conversion.
              </p>
              <button
                onClick={() => navigate('/settings/payment-methods')}
                className="text-yellow-700 hover:text-yellow-800 font-semibold text-sm"
              >
                Add Payment Method →
              </button>
            </div>
          )}
        </div>

        {/* Error Messages */}
        {(error || confirmationError) && (
          <div className="mb-8 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-700 text-sm">{error || confirmationError}</p>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/convert')}
            className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleConfirm}
            disabled={isConfirming || !selectedPaymentMethod}
            className={`flex-1 py-3 px-4 rounded-lg font-semibold transition-all flex items-center justify-center gap-2 ${
              isConfirming || !selectedPaymentMethod
                ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            }`}
          >
            {isConfirming && <Loader className="w-4 h-4 animate-spin" />}
            {isConfirming ? 'Processing...' : 'Confirm Exchange'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConvertQuote;