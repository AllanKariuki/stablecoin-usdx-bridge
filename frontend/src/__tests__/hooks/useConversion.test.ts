/**
 * useConversion Hook Tests
 * Unit tests for conversion hook functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useConversion } from '@src/hooks/useConversion';
import * as fixtures from '@src/test-data/conversion-fixtures';

// Mock API client
vi.mock('@src/api/conversionClient', () => ({
  conversionClient: {
    getCurrencies: vi.fn(() => Promise.resolve(fixtures.mockCurrencies)),
    getQuote: vi.fn((request) =>
      Promise.resolve({
        success: true,
        data: fixtures.createMockQuote({
          fromCurrency: request.fromCurrency,
          toCurrency: request.toCurrency,
          fromAmount: request.amount,
        }),
      })
    ),
    confirmConversion: vi.fn(() =>
      Promise.resolve({
        success: true,
        data: fixtures.createMockTransaction(),
      })
    ),
    getWallets: vi.fn(() => Promise.resolve(fixtures.mockWallets)),
    getKYCStatus: vi.fn(() => Promise.resolve(fixtures.mockKYCData)),
    getTransactionHistory: vi.fn(() => Promise.resolve(fixtures.mockTransactionHistory)),
    subscribeToTransactionStatus: vi.fn(() => () => {}),
    clearQuoteCache: vi.fn(),
  },
}));

// Wrapper component
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: any) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

describe('useConversion Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should fetch currencies on mount', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.currencies).toHaveLength(fixtures.mockCurrencies.length);
    });
  });

  it('should get quote successfully', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    result.current.getQuote({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      amount: 1000,
    });

    await waitFor(() => {
      expect(result.current.currentQuote).toBeDefined();
      expect(result.current.currentQuote?.fromCurrency).toBe('USD');
      expect(result.current.currentQuote?.toCurrency).toBe('EUR');
    });
  });

  it('should handle quote expiry', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    const expiredQuote = fixtures.createMockQuote({
      expiresAt: new Date(Date.now() - 1000).toISOString(), // Already expired
    });

    result.current.getQuote({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      amount: 1000,
    });

    await waitFor(() => {
      expect(result.current.currentQuote).toBeDefined();
    });

    // After quote expires, it should be cleared
    await waitFor(
      () => {
        expect(result.current.currentQuote).toBeNull();
      },
      { timeout: 2000 }
    );
  });

  it('should fetch wallets', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.wallets).toHaveLength(fixtures.mockWallets.length);
    });
  });

  it('should fetch KYC status', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    await waitFor(() => {
      expect(result.current.kycStatus).toBeDefined();
      expect(result.current.kycStatus?.status).toBe('approved');
    });
  });

  it('should clear quote when requested', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    result.current.getQuote({
      fromCurrency: 'USD',
      toCurrency: 'EUR',
      amount: 1000,
    });

    await waitFor(() => {
      expect(result.current.currentQuote).toBeDefined();
    });

    result.current.clearQuote();

    expect(result.current.currentQuote).toBeNull();
  });

  it('should reset state when requested', async () => {
    const { result } = renderHook(() => useConversion(), { wrapper: createWrapper() });

    result.current.reset();

    expect(result.current.currentQuote).toBeNull();
    expect(result.current.currentTransaction).toBeNull();
    expect(result.current.transactionStatus).toBeNull();
    expect(result.current.transactionError).toBeNull();
  });
});
