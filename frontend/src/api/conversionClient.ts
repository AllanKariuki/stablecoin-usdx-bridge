/**
 * Conversion API Client
 * Typed API functions with mock implementations that can be swapped via environment variables
 */

import type { AxiosInstance } from 'axios';
import { axiosInstance } from './index';
import type {
  ConversionQuote,
  QuoteRequest,
  QuoteResponse,
  ConversionRequest,
  ConversionResponse,
  TransactionStatusUpdate,
  Currency,
  Wallet,
  KYCData,
  TransactionHistory,
} from '../types/conversion';
import {
  mockConfirmConversion,
  mockGetCurrencies,
  mockGetKYCStatus,
  mockGetQuote,
  mockGetTransactionHistory,
  mockGetTransactionStatus,
  mockGetWallets,
} from '../lib/utils/conversionMocks';

/**
 * Mocking is off by default, and is now a real flag rather than a constant.
 *
 * `const USE_MOCK = 'true'` — a non-empty string, so unconditionally truthy —
 * made every method in this file return invented rates and fake conversions,
 * with the env-driven line directly above it commented out. The FX screens
 * looked fully working and moved no money.
 *
 * core-ledger has served `/fx/quotes` and `/fx/conversions` since before this
 * file was written; the BFF forwards them. Setting VITE_USE_MOCK_API=true is
 * still possible for a UI-only demo, but it is now something somebody has to
 * choose.
 */
const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';


/**
 * Conversion API Client
 */
export class ConversionClient {
  private api: AxiosInstance;
  private quoteCache: Map<string, ConversionQuote & { cachedAt: number }> = new Map();
  private readonly QUOTE_TTL = 5 * 60 * 1000; // 5 minutes

  /**
   * Uses the app's shared axios instance rather than creating a second one.
   *
   * The old constructor built its own client against
   * `VITE_API_BASE_URL || 'http://localhost:3000/api'` — a default that now
   * points at the notifications WebSocket — and attached a bearer token it
   * read from `localStorage.authToken`, a key nothing in this app has ever
   * written (the token lives in sessionStorage, via authUtils). So every
   * non-mocked call it made was unauthenticated, to the wrong port.
   *
   * The shared instance carries the gateway base URL from runtime-config.js
   * and attaches the real token in its request interceptor.
   */
  constructor() {
    this.api = axiosInstance;
  }

  /**
   * Get list of supported currencies
   * @returns Promise<Currency[]>
   */
  async getCurrencies(): Promise<Currency[]> {
    if (USE_MOCK) {
      return this.mockGetCurrencies();
    }
    const response = await this.api.get<{ currencies: Currency[] }>('/currencies');
    return response.data.currencies;
  }

  /**
   * Get conversion quote
   * Caches quotes for 5 minutes to avoid repeated API calls
   * @param request - Quote request with currencies and amount
   * @returns Promise<QuoteResponse>
   */
  async getQuote(request: QuoteRequest): Promise<QuoteResponse> {
    const cacheKey = `${request.fromCurrency}_${request.toCurrency}_${request.amount}`;

    // Check cache first
    const cached = this.quoteCache.get(cacheKey);
    if (cached && Date.now() - cached.cachedAt < this.QUOTE_TTL) {
      return { success: true, data: cached };
    }

    if (USE_MOCK) {
      return this.mockGetQuote(request);
    }

    try {
      // core-ledger's own route shape (see its handlers.go), forwarded by the
      // BFF. The bare '/quotes' this used to post to has never existed.
      const response = await this.api.post<ConversionQuote>('/fx/quotes', request);
      const quote = response.data;

      // Cache the quote
      this.quoteCache.set(cacheKey, { ...quote, cachedAt: Date.now() });

      return { success: true, data: quote };
    } catch (error: any) {
      console.log(error);
      return {
        success: false,
        error: {
          code: 'QUOTE_ERROR',
          message: 'Failed to fetch quote',
        },
      };
    }
  }

  /**
   * Confirm conversion and process transaction
   * Uses idempotency key to prevent duplicate transactions
   * @param request - Conversion request with quote and payment method
   * @returns Promise<ConversionResponse>
   */
  async confirmConversion(request: ConversionRequest): Promise<ConversionResponse> {
    if (USE_MOCK) {
      return this.mockConfirmConversion(request);
    }

    try {
      const response = await this.api.post<ConversionResponse>('/fx/conversions', request, {
        headers: {
          'Idempotency-Key': request.idempotencyKey,
        },
      });
      return response.data;
    } catch (error: any) {
      return {
        success: false,
        error: {
          code: 'CONVERSION_ERROR',
          message: `Failed to confirm conversion ${error.message || ''}`,
        },
      };
    }
  }

  /**
   * Get transaction status updates
   * Long-poll or WebSocket can be used server-side
   * @param transactionId - Transaction ID to poll
   * @returns Promise<TransactionStatusUpdate>
   */
  async getTransactionStatus(
    transactionId: string
  ): Promise<TransactionStatusUpdate | null> {
    if (USE_MOCK) {
      return this.mockGetTransactionStatus(transactionId);
    }

    try {
      const response = await this.api.get<TransactionStatusUpdate>(
        `/transactions/${transactionId}`
      );
      return response.data;
    } catch (error: any) {
      console.log(error);
      
      return null;
    }
  }

  /**
   * Get transaction history
   * @param limit - Number of records to fetch
   * @param offset - Pagination offset
   * @returns Promise<TransactionHistory[]>
   */
  async getTransactionHistory(
    limit = 20,
    offset = 0
  ): Promise<TransactionHistory[]> {
    if (USE_MOCK) {
      return this.mockGetTransactionHistory(limit, offset);
    }

    try {
      const response = await this.api.get<{ data: TransactionHistory[] }>(
        '/transactions',
        {
          params: { limit, offset },
        }
      );
      return response.data.data;
    } catch (error) {
      console.log(error);
      
      return [];
    }
  }

  /**
   * Get user wallets
   * @returns Promise<Wallet[]>
   */
  async getWallets(): Promise<Wallet[]> {
    if (USE_MOCK) {
      return this.mockGetWallets();
    }

    try {
      const response = await this.api.get<{ data: Wallet[] }>('/wallets');
      return response.data.data;
    } catch (error: any) {
      console.log(error);
      return [];
    }
  }

  /**
   * Get KYC status
   * @returns Promise<KYCData>
   */
  async getKYCStatus(): Promise<KYCData> {
    if (USE_MOCK) {
      return this.mockGetKYCStatus();
    }

    try {
      const response = await this.api.get<KYCData>('/kyc/status');
      return response.data;
    } catch (error: any) {
      console.log(error);
      // Status unknown: report the lowest tier with no headroom rather than
      // inventing limits the user was never granted.
      return {
        status: 'pending',
        level: 1,
        documents: [],
        limits: {
          dailyLimit: 0,
          monthlyLimit: 0,
          singleTransactionLimit: 0,
        },
      };
    }
  }

  /**
   * Subscribe to transaction status via WebSocket
   * Automatically falls back to polling if WebSocket unavailable
   * @param transactionId - Transaction ID
   * @param onStatusUpdate - Callback for status updates
   * @returns Function to unsubscribe
   */
  subscribeToTransactionStatus(
    transactionId: string,
    onStatusUpdate: (status: TransactionStatusUpdate) => void
  ): () => void {
    const wsUrl =
      (import.meta.env.VITE_WS_URL || 'ws://localhost:3000') +
      `/ws/transactions/${transactionId}`;

    let ws: WebSocket | null = null;
    let pollInterval: NodeJS.Timeout | null = null;
    let isActive = true;

    // Fallback polling mechanism. Declared before the WebSocket setup: the
    // synchronous catch below calls it, and a `const` arrow is not hoisted.
    const startPolling = () => {
      if (pollInterval) return; // Already polling
      pollInterval = setInterval(async () => {
        if (!isActive) return;
        const status = await this.getTransactionStatus(transactionId);
        if (status) {
          onStatusUpdate(status);
          // Stop polling when transaction is complete
          if (
            status.status === 'completed' ||
            status.status === 'failed' ||
            status.status === 'cancelled'
          ) {
            isActive = false;
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          }
        }
      }, 2000); // Poll every 2 seconds
    };

    // Try WebSocket first
    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log(`WebSocket connected for transaction ${transactionId}`);
      };

      ws.onmessage = (event) => {
        const update = JSON.parse(event.data) as TransactionStatusUpdate;
        if (isActive) {
          onStatusUpdate(update);
        }
      };

      ws.onerror = () => {
        console.warn('WebSocket error, falling back to polling');
        startPolling();
      };

      ws.onclose = () => {
        if (isActive) {
          console.log('WebSocket closed, falling back to polling');
          startPolling();
        }
      };
    } catch (error) {
      console.warn('WebSocket connection failed, using polling', error);
      startPolling();
    }

    // Unsubscribe function
    return () => {
      isActive = false;
      if (ws) {
        ws.close();
      }
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }

  /**
   * Clear quote cache
   */
  clearQuoteCache(): void {
    this.quoteCache.clear();
  }

  // ============ MOCK IMPLEMENTATIONS ============
  //
  // Only reached when VITE_USE_MOCK_API=true. These delegate to the shared
  // fixtures in lib/utils/conversionMocks (the same ones conversionSlice falls
  // back to) rather than keeping a second, hand-rolled copy here that had
  // drifted out of step with the `types/conversion` contract.

  private mockGetCurrencies(): Currency[] {
    return mockGetCurrencies();
  }

  private mockGetQuote(request: QuoteRequest): QuoteResponse {
    return mockGetQuote(request);
  }

  private mockConfirmConversion(request: ConversionRequest): ConversionResponse {
    return mockConfirmConversion(request);
  }

  private mockGetTransactionStatus(transactionId: string): TransactionStatusUpdate {
    return mockGetTransactionStatus(transactionId);
  }

  private mockGetTransactionHistory(limit: number, offset: number): TransactionHistory[] {
    return mockGetTransactionHistory(limit, offset);
  }

  private mockGetWallets(): Wallet[] {
    return mockGetWallets();
  }

  private mockGetKYCStatus(): KYCData {
    return mockGetKYCStatus();
  }
}

// Singleton instance
export const conversionClient = new ConversionClient();
