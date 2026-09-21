/**
 * Conversion API Client
 * Typed API functions with mock implementations that can be swapped via environment variables
 */

import axios, { type AxiosInstance } from 'axios';
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

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api';
// const USE_MOCK = import.meta.env.VITE_USE_MOCK_API === 'true';
const USE_MOCK = 'true';


/**
 * Conversion API Client
 */
export class ConversionClient {
  private api: AxiosInstance;
  private quoteCache: Map<string, ConversionQuote & { cachedAt: number }> = new Map();
  private readonly QUOTE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(baseURL = API_BASE_URL) {
    this.api = axios.create({
      baseURL,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      this.api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }
  }

  /**
   * Get list of supported currencies
   * @returns Promise<Currency[]>
   */
  async getCurrencies(): Promise<Currency[]> {
    if (USE_MOCK) {
      return this.mockGetCurrencies();
    }
    const response = await this.api.get<{ data: Currency[] }>('/currencies');
    return response.data.data;
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
      const response = await this.api.post<ConversionQuote>('/quotes', request);
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
      const response = await this.api.post<ConversionResponse>('/conversions', request, {
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
      return {
        status: 'pending',
        level: 1,
        documents: [],
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

    // Fallback polling mechanism
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

  private mockGetCurrencies(): Currency[] {
    return [
      {
        code: 'USD',
        name: 'US Dollar',
        symbol: '$',
        flagEmoji: '🇺🇸',
      },
      {
        code: 'EUR',
        name: 'Euro',
        symbol: '€',
        flagEmoji: '🇪🇺',
      },
      {
        code: 'GBP',
        name: 'British Pound',
        symbol: '£',
        flagEmoji: '🇬🇧',
      },
      {
        code: 'JPY',
        name: 'Japanese Yen',
        symbol: '¥',
        flagEmoji: '🇯🇵',
      },
      {
        code: 'AUD',
        name: 'Australian Dollar',
        symbol: 'A$',
        flagEmoji: '🇦🇺',
      },
      {
        code: 'CAD',
        name: 'Canadian Dollar',
        symbol: 'C$',
        flagEmoji: '🇨🇦',
      },
      {
        code: 'CHF',
        name: 'Swiss Franc',
        symbol: 'CHF',
        flagEmoji: '🇨🇭',
      },
    ];
  }

  private mockGetQuote(request: QuoteRequest): QuoteResponse {
    // Simulate realistic exchange rates
    const rates: Record<string, number> = {
      USD: 1,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 149.5,
      AUD: 1.52,
      CAD: 1.36,
      CHF: 0.88,
    };

    const fromRate = rates[request.fromCurrency] || 1;
    const toRate = rates[request.toCurrency] || 1;
    const exchangeRate = toRate / fromRate;

    const toAmount = Number((request.amount * exchangeRate).toFixed(2));
    const processingFee = request.amount * 0.015; // 1.5%
    const conversionFee = 0.5; // flat 0.5% on converted amount
    const bankFee = 2.5; // flat $2.50

    return {
      success: true,
      data: {
        quoteId: `QT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fromCurrency: request.fromCurrency,
        toCurrency: request.toCurrency,
        fromAmount: request.amount,
        toAmount,
        exchangeRate: Number(exchangeRate.toFixed(4)),
        fees: {
          processingFee: 1.5,
          conversionFee: 0.5,
          bankFee,
          total: 2.0,
        },
        totalFees: processingFee + toAmount * 0.005 + bankFee,
        netAmount: toAmount - toAmount * 0.005 - bankFee,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
      },
    };
  }

  private mockConfirmConversion(request: ConversionRequest): ConversionResponse {
    return {
      success: true,
      data: {
        transactionId: `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        quoteId: request.quoteId,
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        fromAmount: 1000,
        toAmount: 920,
        fees: {
          processingFee: 1.5,
          conversionFee: 0.5,
          bankFee: 2.5,
          total: 2.0,
        },
        paymentMethod: {
          id: 'pm-001',
          type: 'bank_account',
          name: 'Main Bank Account',
          lastFour: '4242',
          isDefault: true,
        },
        status: 'processing',
        createdAt: new Date().toISOString(),
      },
    };
  }

  private mockGetTransactionStatus(
    transactionId: string
  ): TransactionStatusUpdate {
    const statuses: TransactionStatusUpdate['status'][] = [
      'pending',
      'processing',
      'completed',
    ];
    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

    return {
      transactionId,
      status: randomStatus,
      updatedAt: new Date().toISOString(),
      message:
        randomStatus === 'completed'
          ? 'Transaction completed successfully'
          : 'Transaction is processing',
    };
  }

  private mockGetTransactionHistory(
    limit: number,
    offset: number
  ): TransactionHistory[] {
    const history: TransactionHistory[] = [];
    for (let i = offset; i < offset + limit; i++) {
      history.push({
        transactionId: `TX-${1000 + i}`,
        fromCurrency: i % 2 === 0 ? 'USD' : 'EUR',
        toCurrency: i % 2 === 0 ? 'EUR' : 'USD',
        fromAmount: 500 + i * 10,
        toAmount: 450 + i * 9,
        status: 'completed',
        createdAt: new Date(Date.now() - i * 86400000).toISOString(),
        completedAt: new Date(Date.now() - i * 86400000 + 3600000).toISOString(),
        direction: i % 2 === 0 ? 'sent' : 'received',
      });
    }
    return history;
  }

  private mockGetWallets(): Wallet[] {
    return [
      {
        id: 'wallet-usd',
        currency: 'USD',
        balance: 5000,
        available: 4500,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'wallet-eur',
        currency: 'EUR',
        balance: 2000,
        available: 1800,
        lastUpdated: new Date().toISOString(),
      },
      {
        id: 'wallet-gbp',
        currency: 'GBP',
        balance: 1500,
        available: 1400,
        lastUpdated: new Date().toISOString(),
      },
    ];
  }

  private mockGetKYCStatus(): KYCData {
    return {
      status: 'approved',
      level: 2,
      verificationDate: new Date(Date.now() - 30 * 86400000).toISOString(),
      nextReviewDate: new Date(Date.now() + 330 * 86400000).toISOString(),
      documents: [
        {
          id: 'doc-1',
          type: 'passport',
          status: 'verified',
          uploadDate: new Date(Date.now() - 30 * 86400000).toISOString(),
          expiryDate: new Date(Date.now() + 3650 * 86400000).toISOString(),
        },
        {
          id: 'doc-2',
          type: 'address_proof',
          status: 'verified',
          uploadDate: new Date(Date.now() - 25 * 86400000).toISOString(),
        },
      ],
    };
  }
}

// Singleton instance
export const conversionClient = new ConversionClient();
