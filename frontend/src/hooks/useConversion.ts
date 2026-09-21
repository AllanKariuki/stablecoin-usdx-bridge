/**
 * useConversion Hook
 * Main hook for managing currency conversion flow with React Query
 */

import { useCallback, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { conversionClient } from '../api/conversionClient';
import type {
  ConversionQuote,
  QuoteRequest,
  ConversionConfirmation,
  TransactionStatusUpdate,
  TransactionStatus,
  Currency,
  Wallet,
  KYCData,
} from '../types/conversion';

/**
 * Hook state for conversion flow
 */
export interface UseConversionState {
  currentQuote: ConversionQuote | null;
  currentTransaction: ConversionConfirmation | null;
  transactionStatus: TransactionStatus | null;
  transactionError: string | null;
}

/**
 * Main conversion hook
 * Handles quotes, conversions, and status polling/WebSocket
 */
export function useConversion() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<UseConversionState>({
    currentQuote: null,
    currentTransaction: null,
    transactionStatus: null,
    transactionError: null,
  });

  // ============ QUERIES ============

  /**
   * Get supported currencies
   */
  const { data: currencies = [] } = useQuery({
    queryKey: ['conversion:currencies'],
    queryFn: () => conversionClient.getCurrencies(),
    staleTime: 1000 * 60 * 60, // 1 hour
  });

  /**
   * Get user wallets
   */
  const { data: wallets = [] } = useQuery({
    queryKey: ['conversion:wallets'],
    queryFn: () => conversionClient.getWallets(),
    staleTime: 1000 * 60, // 1 minute
  });

  /**
   * Get KYC status
   */
  const { data: kycStatus } = useQuery({
    queryKey: ['conversion:kyc-status'],
    queryFn: () => conversionClient.getKYCStatus(),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });

  /**
   * Get transaction history
   */
  const {
    data: transactionHistory = [],
    refetch: refetchHistory,
  } = useQuery({
    queryKey: ['conversion:history'],
    queryFn: () => conversionClient.getTransactionHistory(20, 0),
    staleTime: 1000 * 30, // 30 seconds
  });

  // ============ MUTATIONS ============

  /**
   * Get quote mutation
   * Handles quote caching with 5-minute expiry
   */
  const getQuoteMutation = useMutation({
    mutationFn: async (request: QuoteRequest) => {
      const response = await conversionClient.getQuote(request);
      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to get quote');
      }
      return response.data;
    },
    onSuccess: (quote) => {
      setState((prev) => ({
        ...prev,
        currentQuote: quote,
      }));

      // Cache invalidation after quote expires
      const expiresAt = new Date(quote.expiresAt).getTime();
      const now = Date.now();
      const ttl = Math.max(0, expiresAt - now);

      if (ttl > 0) {
        setTimeout(() => {
          setState((prev) => ({
            ...prev,
            currentQuote: null,
          }));
        }, ttl);
      }
    },
  });

  /**
   * Confirm conversion mutation
   * Uses idempotency keys to prevent duplicate transactions
   */
  const confirmConversionMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      if (!state.currentQuote) {
        throw new Error('No quote available');
      }

      // Generate UUID v4 for idempotency key
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;
      const response = await conversionClient.confirmConversion({
        quoteId: state.currentQuote.quoteId,
        paymentMethodId,
        idempotencyKey,
      });

      if (!response.success || !response.data) {
        throw new Error(response.error?.message || 'Failed to confirm conversion');
      }

      return response.data;
    },
    onSuccess: (transaction) => {
      setState((prev) => ({
        ...prev,
        currentTransaction: transaction,
        transactionStatus: transaction.status,
      }));

      // Invalidate history cache
      queryClient.invalidateQueries({ queryKey: ['conversion:history'] });
    },
    onError: (error) => {
      setState((prev) => ({
        ...prev,
        transactionError: error instanceof Error ? error.message : 'Unknown error',
      }));
    },
  });

  // ============ SUBSCRIPTION MANAGEMENT ============

  /**
   * Subscribe to transaction status updates
   * Automatically manages WebSocket with polling fallback
   */
  const subscribeToStatus = useCallback(
    (transactionId: string) => {
      const unsubscribe = conversionClient.subscribeToTransactionStatus(
        transactionId,
        (update: TransactionStatusUpdate) => {
          setState((prev) => ({
            ...prev,
            transactionStatus: update.status,
            transactionError: null,
          }));
        }
      );

      return unsubscribe;
    },
    []
  );

  // ============ PUBLIC ACTIONS ============

  /**
   * Get a new quote
   */
  const getQuote = useCallback(
    (request: QuoteRequest) => {
      return getQuoteMutation.mutate(request);
    },
    [getQuoteMutation]
  );

  /**
   * Confirm the current quote and process conversion
   */
  const confirmConversion = useCallback(
    (paymentMethodId: string) => {
      return confirmConversionMutation.mutate(paymentMethodId);
    },
    [confirmConversionMutation]
  );

  /**
   * Clear current quote
   */
  const clearQuote = useCallback(() => {
    setState((prev) => ({
      ...prev,
      currentQuote: null,
    }));
    conversionClient.clearQuoteCache();
  }, []);

  /**
   * Reset conversion state
   */
  const reset = useCallback(() => {
    setState({
      currentQuote: null,
      currentTransaction: null,
      transactionStatus: null,
      transactionError: null,
    });
    conversionClient.clearQuoteCache();
  }, []);

  return {
    // State
    ...state,

    // Currencies & Wallets
    currencies,
    wallets,
    kycStatus,
    transactionHistory,

    // Quote operations
    getQuote,
    clearQuote,
    isLoadingQuote: getQuoteMutation.isPending,
    quoteError: getQuoteMutation.error?.message,

    // Conversion operations
    confirmConversion,
    isConfirming: confirmConversionMutation.isPending,

    // Transaction monitoring
    subscribeToStatus,

    // Utils
    refetchHistory,
    reset,
  };
}

/**
 * Hook for fetching a single currency pair exchange rate
 */
export function useExchangeRate(from: string, to: string, amount: number) {
  return useQuery({
    queryKey: ['conversion:quote', from, to, amount],
    queryFn: async () => {
      const response = await conversionClient.getQuote({
        fromCurrency: from,
        toCurrency: to,
        amount,
      });
      return response.data;
    },
    staleTime: 1000 * 60, // 1 minute
    enabled: Boolean(from && to && amount),
  });
}

/**
 * Hook for monitoring a specific transaction
 */
export function useTransactionMonitor(transactionId: string | null) {
  const [status, setStatus] = useState<TransactionStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const subscribe = useCallback(
    (txId: string) => {
      const unsubscribe = conversionClient.subscribeToTransactionStatus(
        txId,
        (update) => {
          setStatus(update.status);
          setError(null);
        }
      );

      return unsubscribe;
    },
    []
  );

  const startMonitoring = useCallback(() => {
    if (!transactionId) {
      setError('No transaction ID provided');
      return;
    }

    try {
      return subscribe(transactionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to monitor transaction');
      return () => {};
    }
  }, [transactionId, subscribe]);

  return {
    status,
    error,
    startMonitoring,
  };
}
