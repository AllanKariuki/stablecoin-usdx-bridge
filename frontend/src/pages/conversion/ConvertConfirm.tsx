/**
 * ConvertConfirm Page
 * Transaction confirmation and status monitoring
 */

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle,
  Clock,
  AlertCircle,
  Loader,
  Home,
  Copy,
  ArrowRight,
  ExternalLink,
  Blocks,
} from 'lucide-react';
import { useConversion, useTransactionMonitor } from '../../hooks/useConversionWithRedux';

/**
 * ConvertConfirm - Transaction status monitoring and completion
 */
export default function ConvertConfirm() {
  const { txId } = useParams<{ txId: string }>();
  const navigate = useNavigate();
  const { currentTransaction, isConfirming, currencies, reset } = useConversion();
  const { status, startMonitoring } = useTransactionMonitor(txId || null);
  const [isCopied, setIsCopied] = useState(false);
  const [isTxHashCopied, setIsTxHashCopied] = useState(false);

  // Check if crypto is involved
  const fromCurrency = currentTransaction && currencies.find(
    c => c.code === currentTransaction.fromCurrency
  );
  const toCurrency = currentTransaction && currencies.find(
    c => c.code === currentTransaction.toCurrency
  );
  const isCryptoInvolved = fromCurrency?.type === 'crypto' || toCurrency?.type === 'crypto';

  // Start monitoring when component mounts
  useEffect(() => {
    if (txId) {
      const unsubscribe = startMonitoring();
      return () => unsubscribe?.();
    }
  }, [txId, startMonitoring]);

  // Reset conversion state when user starts a new exchange (navigates to /convert)
  useEffect(() => {
    return () => {
      // Only reset if navigating to /convert (starting new exchange)
      // Don't reset if navigating within the conversion flow or to history
      const nextPath = window.location.pathname;
      if (nextPath === '/convert' && !nextPath.includes('/convert/')) {
        reset();
      }
    };
  }, [reset]);

  console.log('ConvertConfirm - Current Transaction from Redux: ', currentTransaction);

  // Show loading state while confirming
  if (isConfirming) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <Loader className="w-12 h-12 text-blue-600 mx-auto mb-4 animate-spin" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Processing Transaction</h2>
          <p className="text-gray-600">Please wait...</p>
        </div>
      </div>
    );
  }

  if (!currentTransaction) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 mb-2">Transaction Not Found</h2>
          <p className="text-gray-600 mb-6">Unable to load transaction details</p>
          <button
            onClick={() => navigate('/convert/history')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            <Home className="w-4 h-4" />
            View History
          </button>
        </div>
      </div>
    );
  }

  const getStatusDisplay = () => {
    const currentStatus = status || currentTransaction.status;
    switch (currentStatus) {
      case 'completed':
        return {
          icon: <CheckCircle className="w-16 h-16 text-green-600" />,
          title: 'Exchange Completed',
          description: 'Your currency exchange has been processed successfully',
          color: 'bg-green-50 border-green-200',
        };
      case 'confirming':
        return {
          icon: <Blocks className="w-16 h-16 text-blue-600 animate-pulse" />,
          title: 'Confirming on Blockchain',
          description: 'Waiting for blockchain confirmations. This may take a few minutes.',
          color: 'bg-blue-50 border-blue-200',
        };
      case 'broadcasting':
        return {
          icon: <Loader className="w-16 h-16 text-blue-600 animate-spin" />,
          title: 'Broadcasting Transaction',
          description: 'Your transaction is being broadcast to the blockchain network.',
          color: 'bg-blue-50 border-blue-200',
        };
      case 'processing':
        return {
          icon: <Loader className="w-16 h-16 text-blue-600 animate-spin" />,
          title: 'Processing Exchange',
          description: 'Your exchange is being processed. This may take a few minutes.',
          color: 'bg-blue-50 border-blue-200',
        };
      case 'pending':
        return {
          icon: <Clock className="w-16 h-16 text-yellow-600" />,
          title: 'Exchange Pending',
          description: 'Your exchange request is pending. We are preparing it for processing.',
          color: 'bg-yellow-50 border-yellow-200',
        };
      case 'failed':
        return {
          icon: <AlertCircle className="w-16 h-16 text-red-600" />,
          title: 'Exchange Failed',
          description: 'Unfortunately, your exchange could not be completed. Please try again.',
          color: 'bg-red-50 border-red-200',
        };
      case 'cancelled':
        return {
          icon: <AlertCircle className="w-16 h-16 text-gray-600" />,
          title: 'Exchange Cancelled',
          description: 'Your exchange has been cancelled.',
          color: 'bg-gray-50 border-gray-200',
        };
      case 'expired':
        return {
          icon: <AlertCircle className="w-16 h-16 text-orange-600" />,
          title: 'Quote Expired',
          description: 'The quote expired before the transaction could be completed.',
          color: 'bg-orange-50 border-orange-200',
        };
      default:
        return {
          icon: <Clock className="w-16 h-16 text-gray-600" />,
          title: 'Unknown Status',
          description: 'Unable to determine transaction status',
          color: 'bg-gray-50 border-gray-200',
        };
    }
  };

  const statusDisplay = getStatusDisplay();

  const handleCopyId = () => {
    navigator.clipboard.writeText(currentTransaction.transactionId);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleCopyTxHash = () => {
    if (currentTransaction.txHash) {
      navigator.clipboard.writeText(currentTransaction.txHash);
      setIsTxHashCopied(true);
      setTimeout(() => setIsTxHashCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Status Card */}
        <div
          className={`bg-white rounded-lg border p-8 text-center mb-8 ${statusDisplay.color}`}
        >
          <div className="flex justify-center mb-6">{statusDisplay.icon}</div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{statusDisplay.title}</h1>
          <p className="text-gray-600 mb-6">{statusDisplay.description}</p>

          {/* Status Badge */}
          <div className="inline-block px-4 py-2 bg-white rounded-full border border-gray-200 mb-6">
            <p className="text-sm font-semibold text-gray-900 capitalize">{status || currentTransaction.status}</p>
          </div>
        </div>

        {/* Transaction Details */}
        <div className="bg-white rounded-lg border border-gray-200 p-8 mb-8">
          <h2 className="text-lg font-bold text-gray-900 mb-6">Transaction Details</h2>

          <div className="space-y-4">
            {/* Transaction ID */}
            <div className="pb-4 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-1">Transaction ID</p>
              <div className="flex items-center justify-between">
                <code className="text-sm font-mono text-gray-900 bg-gray-50 px-3 py-2 rounded">
                  {currentTransaction.transactionId}
                </code>
                <button
                  onClick={handleCopyId}
                  className="p-2 text-gray-600 hover:text-gray-900 transition-colors"
                  title="Copy transaction ID"
                >
                  {isCopied ? <CheckCircle className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Conversion Summary */}
            <div className="pb-4 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-3">Conversion Summary</p>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-lg font-bold text-gray-900">
                    {currentTransaction.fromAmount.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currentTransaction.fromCurrency}
                  </p>
                  <p className="text-sm text-gray-600">You sent</p>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-400" />
                <div className="text-right">
                  <p className="text-lg font-bold text-green-600">
                    {currentTransaction.toAmount.toLocaleString('en-US', {
                      maximumFractionDigits: 2,
                    })}{' '}
                    {currentTransaction.toCurrency}
                  </p>
                  <p className="text-sm text-gray-600">You received</p>
                </div>
              </div>
            </div>

            {/* Fee Summary */}
            <div className="pb-4 border-b border-gray-200">
              <p className="text-sm text-gray-600 mb-3">Fees & Charges</p>
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Processing Fee</span>
                  <span className="text-gray-900">{currentTransaction.fees.processingFee}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Conversion Fee</span>
                  <span className="text-gray-900">{currentTransaction.fees.conversionFee}%</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Bank Fee</span>
                  <span className="text-gray-900">${(currentTransaction.fees.bankFee || 0).toFixed(2)}</span>
                </div>
              </div>
            </div>

            {/* Dates */}
            <div>
              <p className="text-sm text-gray-600 mb-3">Timeline</p>
              <div className="space-y-1 text-sm text-gray-600">
                <p>Created: {new Date(currentTransaction.createdAt).toLocaleString()}</p>
                {currentTransaction.completedAt && (
                  <p>Completed: {new Date(currentTransaction.completedAt).toLocaleString()}</p>
                )}
              </div>
            </div>

            {/* Blockchain Details (for crypto transactions) */}
            {isCryptoInvolved && (
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3 flex items-center gap-2">
                  <Blocks className="w-4 h-4" />
                  Blockchain Details
                </p>
                
                {currentTransaction.txHash && (
                  <div className="space-y-2">
                    <div className="pb-2">
                      <p className="text-xs text-gray-600 mb-1">Transaction Hash</p>
                      <div className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                        <code className="text-xs font-mono text-gray-900 truncate flex-1">
                          {currentTransaction.txHash}
                        </code>
                        <button
                          onClick={handleCopyTxHash}
                          className="p-1 text-gray-600 hover:text-gray-900 transition-colors ml-2"
                          title="Copy transaction hash"
                        >
                          {isTxHashCopied ? (
                            <CheckCircle className="w-4 h-4" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </button>
                      </div>
                    </div>

                    {currentTransaction.confirmations !== undefined && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Confirmations:</span>{' '}
                        {currentTransaction.confirmations}
                        {currentTransaction.confirmations < 12 && (
                          <span className="ml-2 text-yellow-600">
                            (waiting for more confirmations)
                          </span>
                        )}
                      </div>
                    )}

                    {currentTransaction.blockNumber && (
                      <div className="text-xs text-gray-600">
                        <span className="font-medium">Block:</span> #{currentTransaction.blockNumber}
                      </div>
                    )}

                    {currentTransaction.explorerUrl && (
                      <a
                        href={currentTransaction.explorerUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 mt-2"
                      >
                        View on Block Explorer
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                )}

                {!currentTransaction.txHash && (
                  <p className="text-xs text-gray-500 italic">
                    Blockchain transaction pending...
                  </p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <button
            onClick={() => navigate('/convert/history')}
            className="flex-1 py-3 px-4 rounded-lg font-semibold text-gray-700 bg-gray-200 hover:bg-gray-300 transition-colors"
          >
            View History
          </button>
          <button
            onClick={() => {
              reset(); // Clear state before starting new exchange
              navigate('/convert');
            }}
            className="flex-1 py-3 px-4 rounded-lg font-semibold text-white bg-blue-600 hover:bg-blue-700 transition-colors"
          >
            New Exchange
          </button>
        </div>
      </div>
    </div>
  );
}
