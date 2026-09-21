/**
 * useConversion Hook (Redux Version)
 * Integrates React Query with Redux for currency conversion flow
 * 
 * This hook provides a hybrid approach:
 * - Redux handles state management and async thunks for API calls
 * - React Query can still be used for caching and real-time features
 * - WebSocket subscriptions for transaction monitoring
 */

import { useCallback, useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import type { AppDispatch, RootState } from '../redux/store';
import {
  fetchCurrencies,
  fetchWallets,
  fetchKYCStatus,
  fetchTransactionHistory,
  getConversionQuote,
  confirmConversion as confirmConversionThunk,
  clearQuote,
  resetConversion,
  handleWebSocketTransactionUpdate,
  fetchReserveStatus,
  fetchLiquiditySources,
  fetchOrderBookDepth,
  fetchStablecoinBalance,
  checkConversionLimits,
} from '../redux/slices/conversion/conversionSlice';
import { setupTransactionWebSocket } from '../redux/slices/conversion/conversionWebSocket';
import type {
  QuoteRequest,
} from '../types/conversion';

/**
 * Main conversion hook with Redux integration
 * Handles quotes, conversions, and status monitoring
 */
export function useConversion() {
  const dispatch = useDispatch<AppDispatch>();
  const unsubscribeRef = useRef<(() => void) | null>(null);
  
  // Select state from Redux store
  const {
    currencies,
    wallets,
    kycStatus,
    transactionHistory,
    currentQuote,
    currentTransaction,
    transactionStatus,
    loading,
    errors,
    reserveStatus,
    liquiditySources,
    orderBookDepth,
    stablecoinBalance,
  } = useSelector((state: RootState) => state.conversion);

  // ============ INITIALIZATION ============

  /**
   * Load initial data on mount
   */
  useEffect(() => {
    dispatch(fetchCurrencies());
    dispatch(fetchWallets());
    dispatch(fetchKYCStatus());
  }, [dispatch]);

  // ============ QUOTE OPERATIONS ============

  /**
   * Get a new quote
   */
  const getQuote = useCallback(
    (request: QuoteRequest) => {
      return dispatch(getConversionQuote(request));
    },
    [dispatch]
  );

  /**
   * Clear current quote
   */
  const handleClearQuote = useCallback(() => {
    dispatch(clearQuote());
  }, [dispatch]);

  // ============ CONVERSION OPERATIONS ============
  /**
   * Confirm the current quote and process conversion
   */
  const confirmConversion = useCallback(
    async (paymentMethodId: string) => {
      if (!currentQuote) {
        throw new Error('No quote available');
      }

      const result = await dispatch(
        confirmConversionThunk({
          quoteId: currentQuote.quoteId,
          paymentMethodId,
        })
      );

      // Setup WebSocket monitoring for the transaction
      if (confirmConversionThunk.fulfilled.match(result)) {
        const transactionId = result.payload.transactionId;
        // Clean up previous subscription if exists
        if (unsubscribeRef.current) {
          unsubscribeRef.current();
        }
        // Setup new subscription
        unsubscribeRef.current = setupTransactionWebSocket(
          transactionId,
          dispatch,
          (update) => dispatch(handleWebSocketTransactionUpdate(update))
        );
      }

      return result;
    },
    [dispatch, currentQuote]
  );

  // ============ TRANSACTION MONITORING ============

  /**
   * Manually subscribe to transaction status updates via WebSocket
   * Use this if you need to monitor a specific transaction ID
   */
  const subscribeToStatus = useCallback(
    (transactionId: string) => {
      // Clean up previous subscription if exists
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      // Setup new subscription
      unsubscribeRef.current = setupTransactionWebSocket(
        transactionId,
        dispatch,
        (update) => dispatch(handleWebSocketTransactionUpdate(update))
      );
      return unsubscribeRef.current;
    },
    [dispatch]
  );

  // ============ HISTORY ============

  /**
   * Refresh transaction history
   */
  const refetchHistory = useCallback(
    (limit = 20, offset = 0) => {
      return dispatch(fetchTransactionHistory({ limit, offset }));
    },
    [dispatch]
  );

  // ============ RESET ============

  /**
   * Reset conversion state
   */
  const reset = useCallback(() => {
    dispatch(resetConversion());
  }, [dispatch]);

  // ============ NEW: CRYPTO/STABLECOIN OPERATIONS ============

  /**
   * Fetch reserve status for USD-X transparency
   */
  const getReserveStatus = useCallback(() => {
    return dispatch(fetchReserveStatus());
  }, [dispatch]);

  /**
   * Fetch liquidity sources for a conversion pair
   */
  const getLiquiditySources = useCallback((from: string, to: string) => {
    return dispatch(fetchLiquiditySources({ from, to }));
  }, [dispatch]);

  /**
   * Fetch order book depth for a trading pair
   */
  const getOrderBookDepth = useCallback((from: string, to: string) => {
    return dispatch(fetchOrderBookDepth({ from, to }));
  }, [dispatch]);

  /**
   * Fetch stablecoin balance across all chains
   */
  const getStablecoinBalance = useCallback(() => {
    return dispatch(fetchStablecoinBalance());
  }, [dispatch]);

  /**
   * Check if conversion is within KYC limits
   */
  const checkLimits = useCallback((amount: number, currency: string) => {
    return dispatch(checkConversionLimits({ amount, currency })).then((result) => {
      if (checkConversionLimits.fulfilled.match(result)) {
        return result.payload;
      }
      return { allowed: false, reason: 'Failed to check limits' };
    });
  }, [dispatch]);

  // ============ AUTO-FETCH HISTORY AFTER CONFIRMATION ============

  useEffect(() => {
    if (currentTransaction?.status === 'completed') {
      // Refresh history when transaction completes
      dispatch(fetchTransactionHistory({ limit: 20, offset: 0 }));
    }
  }, [currentTransaction?.status, dispatch]);

  // ============ CLEANUP ON UNMOUNT ============

  useEffect(() => {
    return () => {
      // Clean up WebSocket subscription on unmount
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, []);

  return {
    // State
    currentQuote,
    currentTransaction,
    transactionStatus,
    
    // Currencies & Wallets
    currencies,
    wallets,
    kycStatus,
    transactionHistory,

    // NEW: Crypto/Stablecoin state
    reserveStatus,
    liquiditySources,
    orderBookDepth,
    stablecoinBalance,

    // Quote operations
    getQuote,
    clearQuote: handleClearQuote,
    isLoadingQuote: loading.quote,
    quoteError: errors.quote,

    // Conversion operations
    confirmConversion,
    isConfirming: loading.confirmation,
    confirmationError: errors.confirmation,

    // Transaction monitoring
    subscribeToStatus,
    isLoadingStatus: loading.transactionStatus,
    statusError: errors.transactionStatus,

    // History
    refetchHistory,
    isLoadingHistory: loading.history,
    historyError: errors.history,

    // NEW: Crypto/Stablecoin operations
    getReserveStatus,
    getLiquiditySources,
    getOrderBookDepth,
    getStablecoinBalance,
    checkLimits,

    // Utils
    reset,
    
    // Loading states
    isLoadingCurrencies: loading.currencies,
    isLoadingWallets: loading.wallets,
    isLoadingKYC: loading.kycStatus,
    isLoadingReserveStatus: loading.reserveStatus,
    isLoadingLiquiditySources: loading.liquiditySources,
    isLoadingOrderBookDepth: loading.orderBookDepth,
    isLoadingStablecoinBalance: loading.stablecoinBalance,
  };
}

/**
 * Hook for monitoring a specific transaction
 * Uses Redux state for transaction status
 */
export function useTransactionMonitor(transactionId: string | null) {
  const dispatch = useDispatch<AppDispatch>();
  const { transactionStatus, errors } = useSelector((state: RootState) => state.conversion);
  const unsubscribeRef = useRef<(() => void) | null>(null);

  const startMonitoring = useCallback(() => {
    if (!transactionId) {
      return () => {};
    }

    try {
      // Clean up previous subscription
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
      
      // Setup new subscription
      unsubscribeRef.current = setupTransactionWebSocket(
        transactionId,
        dispatch,
        (update) => dispatch(handleWebSocketTransactionUpdate(update))
      );
      return unsubscribeRef.current;
    } catch (err) {
      console.error('Failed to monitor transaction:', err);
      return () => {};
    }
  }, [transactionId, dispatch]);

  // Auto-start monitoring when transactionId changes
  useEffect(() => {
    if (transactionId) {
      const unsubscribe = startMonitoring();
      return unsubscribe;
    }
  }, [transactionId, startMonitoring]);

  return {
    status: transactionStatus,
    error: errors.transactionStatus,
    startMonitoring,
  };
}
