/**
 * Conversion Integration Examples
 * Shows practical examples of using Redux and React Query approaches
 */

// ============================================
// EXAMPLE 1: Basic Quote Flow (Redux)
// ============================================

import { useConversion } from '../hooks/useConversionWithRedux';

function QuoteFormRedux() {
  const {
    getQuote,
    currentQuote,
    isLoadingQuote,
    quoteError,
    currencies,
  } = useConversion();

  const handleSubmit = async (formData: any) => {
    await getQuote({
      fromCurrency: formData.from,
      toCurrency: formData.to,
      amount: formData.amount,
    });
  };

  return (
    <div>
      {/* Form fields */}
      
      {isLoadingQuote && <p>Loading...</p>}
      
      {currentQuote && (
        <div>
          <p>Rate: {currentQuote.exchangeRate}</p>
          <p>You get: {currentQuote.toAmount}</p>
        </div>
      )}
      
      {quoteError && <p className="error">{quoteError}</p>}
    </div>
  );
}

// ============================================
// EXAMPLE 2: Transaction Monitoring (Redux)
// ============================================

import { useEffect } from 'react';
// import { useConversion } from '../hooks/useConversionWithRedux';

function TransactionMonitorRedux({ transactionId }: { transactionId: string }) {
  const {
    subscribeToStatus,
    transactionStatus,
    currentTransaction,
  } = useConversion();

  // Subscribe to WebSocket updates
  useEffect(() => {
    const unsubscribe = subscribeToStatus(transactionId);
    return unsubscribe; // Cleanup
  }, [transactionId, subscribeToStatus]);

  // React to status changes
  useEffect(() => {
    if (transactionStatus === 'completed') {
      // Show success message
      console.log('Transaction completed!');
    } else if (transactionStatus === 'failed') {
      // Show error message
      console.log('Transaction failed');
    }
  }, [transactionStatus]);

  return (
    <div>
      <h3>Transaction Status: {transactionStatus}</h3>
      {currentTransaction && (
        <div>
          <p>From: {currentTransaction.fromAmount} {currentTransaction.fromCurrency}</p>
          <p>To: {currentTransaction.toAmount} {currentTransaction.toCurrency}</p>
        </div>
      )}
    </div>
  );
}

// ============================================
// EXAMPLE 3: Complete Conversion Flow (Redux)
// ============================================

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
// import { useConversion } from '../hooks/useConversionWithRedux';

function CompleteFlowRedux() {
  const navigate = useNavigate();
  const {
    getQuote,
    confirmConversion,
    currentQuote,
    currentTransaction,
    isLoadingQuote,
    isConfirming,
    reset,
  } = useConversion();

  const [step, setStep] = useState<'quote' | 'confirm' | 'monitor'>('quote');

  // Step 1: Get Quote
  const handleGetQuote = async () => {
    await getQuote({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      amount: 1000,
    });
    setStep('confirm');
  };

  // Step 2: Confirm Conversion
  const handleConfirm = async () => {
    if (!currentQuote) return;
    
    await confirmConversion('payment-method-123');
    setStep('monitor');
  };

  // Step 3: Monitor Transaction
  useEffect(() => {
    if (currentTransaction?.transactionId) {
      const unsubscribe = subscribeToStatus(currentTransaction.transactionId);
      return unsubscribe;
    }
  }, [currentTransaction?.transactionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => reset();
  }, [reset]);

  return (
    <div>
      {step === 'quote' && (
        <button onClick={handleGetQuote} disabled={isLoadingQuote}>
          Get Quote
        </button>
      )}

      {step === 'confirm' && currentQuote && (
        <div>
          <p>Rate: {currentQuote.exchangeRate}</p>
          <button onClick={handleConfirm} disabled={isConfirming}>
            Confirm Conversion
          </button>
        </div>
      )}

      {step === 'monitor' && currentTransaction && (
        <TransactionMonitorRedux transactionId={currentTransaction.transactionId} />
      )}
    </div>
  );
}

// ============================================
// EXAMPLE 4: Using Redux Selectors Directly
// ============================================

import { useSelector, useDispatch } from 'react-redux';
import { RootState, AppDispatch } from '../redux/store';
import {
  getConversionQuote,
  fetchTransactionHistory,
} from '../redux/slices/conversion/conversionSlice';

function DirectReduxUsage() {
  const dispatch = useDispatch<AppDispatch>();
  
  // Select specific state slices
  const currencies = useSelector((state: RootState) => state.conversion.currencies);
  const currentQuote = useSelector((state: RootState) => state.conversion.currentQuote);
  const isLoading = useSelector((state: RootState) => state.conversion.loading.quote);
  const error = useSelector((state: RootState) => state.conversion.errors.quote);

  const handleGetQuote = () => {
    dispatch(getConversionQuote({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      amount: 1000,
    }));
  };

  const handleRefreshHistory = () => {
    dispatch(fetchTransactionHistory({ limit: 20, offset: 0 }));
  };

  return (
    <div>
      <h3>Available Currencies: {currencies.length}</h3>
      <button onClick={handleGetQuote} disabled={isLoading}>
        Get Quote
      </button>
      {error && <p className="error">{error}</p>}
      {currentQuote && <p>Rate: {currentQuote.exchangeRate}</p>}
    </div>
  );
}

// ============================================
// EXAMPLE 5: Transaction History with Pagination
// ============================================

import { useState } from 'react';
// import { useConversion } from '../hooks/useConversionWithRedux';

function TransactionHistoryRedux() {
  const {
    transactionHistory,
    refetchHistory,
    isLoadingHistory,
  } = useConversion();

  const [page, setPage] = useState(0);
  const pageSize = 10;

  const handleNextPage = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    refetchHistory(pageSize, nextPage * pageSize);
  };

  const handlePrevPage = () => {
    const prevPage = Math.max(0, page - 1);
    setPage(prevPage);
    refetchHistory(pageSize, prevPage * pageSize);
  };

  return (
    <div>
      <h3>Transaction History</h3>
      
      {isLoadingHistory ? (
        <p>Loading...</p>
      ) : (
        <ul>
          {transactionHistory.map((tx) => (
            <li key={tx.transactionId}>
              {tx.fromAmount} {tx.fromCurrency} → {tx.toAmount} {tx.toCurrency}
              <span className={`status-${tx.status}`}>{tx.status}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="pagination">
        <button onClick={handlePrevPage} disabled={page === 0}>
          Previous
        </button>
        <span>Page {page + 1}</span>
        <button onClick={handleNextPage}>
          Next
        </button>
      </div>
    </div>
  );
}

// ============================================
// EXAMPLE 6: Wallet Balance Display
// ============================================

// import { useConversion } from '../hooks/useConversionWithRedux';

function WalletBalancesRedux() {
  const { wallets, isLoadingWallets } = useConversion();

  if (isLoadingWallets) {
    return <p>Loading wallets...</p>;
  }

  return (
    <div className="wallet-grid">
      {wallets.map((wallet) => (
        <div key={wallet.id} className="wallet-card">
          <h4>{wallet.currency}</h4>
          <p className="balance">{wallet.balance}</p>
          <p className="available">Available: {wallet.available}</p>
          <small>Updated: {new Date(wallet.lastUpdated).toLocaleString()}</small>
        </div>
      ))}
    </div>
  );
}

// ============================================
// EXAMPLE 7: KYC Status Check
// ============================================

// import { useConversion } from '../hooks/useConversionWithRedux';

function KYCStatusRedux() {
  const { kycStatus, isLoadingKYC } = useConversion();

  if (isLoadingKYC) {
    return <p>Checking KYC status...</p>;
  }

  if (!kycStatus) {
    return <p>No KYC data available</p>;
  }

  return (
    <div className={`kyc-status kyc-${kycStatus.status}`}>
      <h3>KYC Status: {kycStatus.status}</h3>
      <p>Level: {kycStatus.level}</p>
      
      {kycStatus.verificationDate && (
        <p>Verified: {new Date(kycStatus.verificationDate).toLocaleDateString()}</p>
      )}
      
      <div className="documents">
        <h4>Documents</h4>
        {kycStatus.documents.map((doc) => (
          <div key={doc.id} className={`doc-${doc.status}`}>
            <span>{doc.type}</span>
            <span>{doc.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================
// EXAMPLE 8: Multi-Component State Sharing
// ============================================

// Component A: Sets the quote
function QuoteSetter() {
  const { getQuote } = useConversion();
  
  return (
    <button onClick={() => getQuote({ fromCurrency: 'USD', toCurrency: 'EUR', amount: 1000 })}>
      Get Quote
    </button>
  );
}

// Component B: Reads the quote (different component, same state!)
function QuoteDisplay() {
  const { currentQuote } = useConversion();
  
  if (!currentQuote) return <p>No quote available</p>;
  
  return (
    <div>
      <p>Rate: {currentQuote.exchangeRate}</p>
      <p>Amount: {currentQuote.toAmount}</p>
    </div>
  );
}

// Parent component
function MultiComponentExample() {
  return (
    <div>
      <QuoteSetter />
      <QuoteDisplay /> {/* Automatically updates when quote is set! */}
    </div>
  );
}

export {
  QuoteFormRedux,
  TransactionMonitorRedux,
  CompleteFlowRedux,
  DirectReduxUsage,
  TransactionHistoryRedux,
  WalletBalancesRedux,
  KYCStatusRedux,
  MultiComponentExample,
};
