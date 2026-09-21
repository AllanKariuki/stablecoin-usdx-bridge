/**
 * Conversion Redux Selectors
 * Provides memoized selectors for accessing conversion state
 */

import { createSelector } from '@reduxjs/toolkit';
import type { RootState } from '../../store';

// ============ BASE SELECTORS ============

/**
 * Select the entire conversion state
 */
export const selectConversionState = (state: RootState) => state.conversion;

/**
 * Select currencies
 */
export const selectCurrencies = (state: RootState) => state.conversion.currencies;

/**
 * Select wallets
 */
export const selectWallets = (state: RootState) => state.conversion.wallets;

/**
 * Select KYC status
 */
export const selectKYCStatus = (state: RootState) => state.conversion.kycStatus;

/**
 * Select transaction history
 */
export const selectTransactionHistory = (state: RootState) => state.conversion.transactionHistory;

/**
 * Select current quote
 */
export const selectCurrentQuote = (state: RootState) => state.conversion.currentQuote;

/**
 * Select current transaction
 */
export const selectCurrentTransaction = (state: RootState) => state.conversion.currentTransaction;

/**
 * Select transaction status
 */
export const selectTransactionStatus = (state: RootState) => state.conversion.transactionStatus;

/**
 * Select all loading states
 */
export const selectLoadingStates = (state: RootState) => state.conversion.loading;

/**
 * Select all error states
 */
export const selectErrorStates = (state: RootState) => state.conversion.errors;

/**
 * Select quote cache
 */
export const selectQuoteCache = (state: RootState) => state.conversion.quoteCache;

// ============ COMPUTED SELECTORS ============

/**
 * Check if quote is loading
 */
export const selectIsLoadingQuote = (state: RootState) => state.conversion.loading.quote;

/**
 * Check if confirmation is in progress
 */
export const selectIsConfirming = (state: RootState) => state.conversion.loading.confirmation;

/**
 * Check if any loading is in progress
 */
export const selectIsAnyLoading = createSelector(
  [selectLoadingStates],
  (loading) => Object.values(loading).some((isLoading) => isLoading)
);

/**
 * Get quote error
 */
export const selectQuoteError = (state: RootState) => state.conversion.errors.quote;

/**
 * Get confirmation error
 */
export const selectConfirmationError = (state: RootState) => state.conversion.errors.confirmation;

/**
 * Check if current quote is valid (not null and not expired)
 */
export const selectIsQuoteValid = createSelector(
  [selectCurrentQuote],
  (quote) => {
    if (!quote) return false;
    const expiresAt = new Date(quote.expiresAt).getTime();
    return Date.now() < expiresAt;
  }
);

/**
 * Get wallet by currency code
 */
export const selectWalletByCurrency = (currencyCode: string) =>
  createSelector([selectWallets], (wallets) =>
    wallets.find((wallet) => wallet.currency === currencyCode)
  );

/**
 * Get cached quote by cache key
 */
export const selectCachedQuote = (cacheKey: string) =>
  createSelector([selectQuoteCache], (cache) => {
    const cached = cache[cacheKey];
    if (!cached) return null;

    const QUOTE_TTL = 5 * 60 * 1000; // 5 minutes
    if (Date.now() - cached.cachedAt < QUOTE_TTL) {
      return cached.quote;
    }
    return null;
  });

/**
 * Check if transaction is in progress
 */
export const selectIsTransactionInProgress = createSelector(
  [selectTransactionStatus],
  (status) => status === 'pending' || status === 'processing'
);

/**
 * Check if transaction is complete
 */
export const selectIsTransactionComplete = createSelector(
  [selectTransactionStatus],
  (status) => status === 'completed' || status === 'failed' || status === 'cancelled'
);

/**
 * Get KYC approval status
 */
export const selectIsKYCApproved = createSelector(
  [selectKYCStatus],
  (kycStatus) => kycStatus?.status === 'approved'
);

/**
 * Get available wallet balance for a currency
 */
export const selectAvailableBalance = (currencyCode: string) =>
  createSelector([selectWallets], (wallets) => {
    const wallet = wallets.find((w) => w.currency === currencyCode);
    return wallet?.available ?? 0;
  });

/**
 * Check if user has sufficient balance for conversion
 */
export const selectHasSufficientBalance = createSelector(
  [selectCurrentQuote, selectWallets],
  (quote, wallets) => {
    if (!quote) return false;
    const wallet = wallets.find((w) => w.currency === quote.fromCurrency);
    if (!wallet) return false;
    return wallet.available >= quote.fromAmount;
  }
);

/**
 * Get recent transactions (last 5)
 */
export const selectRecentTransactions = createSelector(
  [selectTransactionHistory],
  (history) => history.slice(0, 5)
);

/**
 * Get completed transactions count
 */
export const selectCompletedTransactionsCount = createSelector(
  [selectTransactionHistory],
  (history) => history.filter((tx) => tx.status === 'completed').length
);

/**
 * Get total conversion volume (in base currency)
 */
export const selectTotalConversionVolume = createSelector(
  [selectTransactionHistory],
  (history) =>
    history
      .filter((tx) => tx.status === 'completed')
      .reduce((total, tx) => total + tx.fromAmount, 0)
);
