/**
 * Conversion Redux Slice
 * Manages currency conversion state with async thunks for API interactions
 */

import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import { conversionClient } from '../../../api/conversionClient';
import type {
  ConversionQuote,
  QuoteRequest,
  ConversionRequest,
  ConversionConfirmation,
  TransactionStatusUpdate,
  // TransactionStatus,
  Currency,
  Wallet,
  KYCData,
  TransactionHistory,
  ConversionState,
  // ConversionResponse,
  TransactionStatus,
  QuoteResponse,
  ConversionResponse,
  ReserveStatus,
  LiquiditySource,
  OrderBookDepth,
  StablecoinBalance,
  // AssetType,
} from '../../../types/conversion';
import { mockConfirmConversion, mockGetCurrencies, mockGetKYCStatus, mockGetQuote, mockGetTransactionHistory, mockGetTransactionStatus, mockGetWallets, mockGetStablecoinBalance, mockGetReserveStatus, mockGetOrderBookDepth, mockGetLiquiditySources } from '../../../lib/utils/conversionMocks';
import { get, post } from '../../../api';

const initialState: ConversionState = {
  currencies: [],
  wallets: [],
  kycStatus: null,
  transactionHistory: [],
  currentQuote: null,
  currentTransaction: null,
  transactionStatus: null,
  
  // NEW: Crypto/Stablecoin specific
  reserveStatus: null,
  liquiditySources: [],
  orderBookDepth: null,
  stablecoinBalance: null,
  
  loading: {
    currencies: false,
    wallets: false,
    kycStatus: false,
    quote: false,
    confirmation: false,
    transactionStatus: false,
    history: false,
    reserveStatus: false,
    liquiditySources: false,
    orderBookDepth: false,
    stablecoinBalance: false,
  },
  errors: {
    currencies: null,
    wallets: null,
    kycStatus: null,
    quote: null,
    confirmation: null,
    transactionStatus: null,
    history: null,
    reserveStatus: null,
    liquiditySources: null,
    orderBookDepth: null,
    stablecoinBalance: null,
  },
  quoteCache: {}
};

// ============ ASYNC THUNKS ============

/**
 * Fetch supported currencies
 */
export const fetchCurrencies = createAsyncThunk(
  'conversion/fetchCurrencies',
  async (_, { rejectWithValue }) => {
    try {
      // const currencies = await conversionClient.getCurrencies();
      const currencies = await get<Currency[]>('/currencies');
      return currencies;
    } catch (error: any) {
      const mockCurrencies: Currency[] = mockGetCurrencies();
      if (mockCurrencies.length === 0) {
        return mockCurrencies;
      }
      return rejectWithValue({
        error: error.message || 'Failed to fetch currencies',
        mockData: mockCurrencies
      });
    }
  }
);

/**
 * Fetch user wallets
 */
export const fetchWallets = createAsyncThunk(
  'conversion/fetchWallets',
  async (_, { rejectWithValue }) => {
    try {
      // const wallets = await conversionClient.getWallets();
      const wallets = await get<Wallet[]>('/wallets');
      return wallets;
    } catch (error: any) {
      const mockWallets = mockGetWallets();
      return rejectWithValue({
        error: error.message || 'Failed to fetch wallets',
        mockData: mockWallets
      });
    }
  }
);

/**
 * Fetch KYC status
 */
export const fetchKYCStatus = createAsyncThunk(
  'conversion/fetchKYCStatus',
  async (_, { rejectWithValue }) => {
    try {
      // const kycStatus = await conversionClient.getKYCStatus();
      const kycStatus = await get<KYCData>('/kyc-status');
      return kycStatus;
    } catch (error: any) {
      return rejectWithValue({
        error: error.message || 'Failed to fetch KYC status',
        mockData: mockGetKYCStatus()
      });
    }
  }
);

/**
 * Fetch transaction history
 */
export const fetchTransactionHistory = createAsyncThunk(
  'conversion/fetchTransactionHistory',
  async ({ limit = 20, offset = 0 }: { limit?: number; offset?: number }, { rejectWithValue }) => {
    try {
      // const history = await conversionClient.getTransactionHistory(limit, offset);
      const queryString = `limit=${limit}&offset=${offset}`;
      const history = await get<TransactionHistory[]>(`/transactions?${queryString}`);
      return history;
    } catch (error: any) {
      const mockTransactionHistory = mockGetTransactionHistory(limit, offset);
      return rejectWithValue({
        error: error.message || 'Failed to fetch transaction history',
        mockData: mockTransactionHistory
      });
    }
  }
);

/**
 * Get conversion quote
 */
// export const getConversionQuote = createAsyncThunk(
//   'conversion/getQuote',
//   async (request: QuoteRequest, { rejectWithValue }) => {

//     //first check if there is a cached quote
//     const cacheKey = `${request.fromCurrency}_${request.toCurrency}_${request.amount}`;

//     const cashedQuote = initialState.
//     try {
//       // const response = await conversionClient.getQuote(request);
//       const response = await post<ConversionQuote, QuoteRequest>('/quotes', request);
      
//       return response;
//     } catch (error: any) {

//       return rejectWithValue({
//         error: error.message || 'Failed to get quote',
//         mockData: mockGetQuote(request)
//       });
//     }
//   }
// );
export const getConversionQuote = createAsyncThunk(
  'conversion/getQuote',
  async (request: QuoteRequest, { rejectWithValue, getState }) => {
    const cacheKey = `${request.fromCurrency}_${request.toCurrency}_${request.amount}`;
    const QUOTE_TTL = 5 * 60 * 1000; // 5 minutes
    
    // Check Redux cache
    const state = getState() as { conversion: ConversionState };
    const cached = state.conversion.quoteCache[cacheKey];
    
    if (cached && Date.now() - cached.cachedAt < QUOTE_TTL) {
      return cached.quote; // Return cached quote
    }

    try {
      const response = await post<ConversionQuote, QuoteRequest>('/quotes', request);
      return { quote: response, cacheKey }; // Return both for caching
    } catch (error: any) {
      const mockConversionQuote = mockGetQuote(request);
      console.log('Mock Conversion Quote: ', mockConversionQuote);
      return rejectWithValue({
        error: error.message || 'Failed to get quote',
        mockData: mockConversionQuote as QuoteResponse
      });
    }
  }
);

/**
 * Confirm conversion
 */
export const confirmConversion = createAsyncThunk(
  'conversion/confirmConversion',
  async (
    { quoteId, paymentMethodId }: { quoteId: string; paymentMethodId: string },
    { rejectWithValue }
  ) => {
    console.log('Confirming conversion with quoteId:', quoteId, 'and paymentMethodId:', paymentMethodId);
    // Generate idempotency key
      const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const request: ConversionRequest = {
        quoteId,
        paymentMethodId,
        idempotencyKey,
      };
    try {
      // Generate idempotency key
      // const idempotencyKey = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${Math.random()
      //   .toString(36)
      //   .substr(2, 9)}`;

      // const request: ConversionRequest = {
      //   quoteId,
      //   paymentMethodId,
      //   idempotencyKey,
      // };

      // const response = await conversionClient.confirmConversion(request);
      const response = await post<ConversionConfirmation, ConversionRequest>('/conversions', request);
      // if (!response.success || !response.data) {
      //   return rejectWithValue(response.error?.message || 'Failed to confirm conversion');
      // }
      return response;
    } catch (error: any) {
      const mockConfirmation = mockConfirmConversion(request);
      return rejectWithValue({
        error: error.message || 'Failed to confirm conversion',
        mockData: mockConfirmation
      });
    }
  }
);

/**
 * Fetch transaction status
 */
export const fetchTransactionStatus = createAsyncThunk(
  'conversion/fetchTransactionStatus',
  async (transactionId: string, { rejectWithValue }) => {
    try {
      // const status = await conversionClient.getTransactionStatus(transactionId);
      const status = await get<TransactionStatusUpdate>(`/transactions/${transactionId}/status`);
      // if (!status) {
      //   return rejectWithValue('Transaction not found');
      // }
      return status;
    } catch (error: any) {
      const mockStatus = mockGetTransactionStatus(transactionId);
      return rejectWithValue({
        error: error.message || 'Failed to fetch transaction status',
        mockData: mockStatus
      });
    }
  }
);

/**
 * Get Reserve Status (for USD-X stablecoin transparency)
 */
export const fetchReserveStatus = createAsyncThunk(
  'conversion/fetchReserveStatus',
  async (_, { rejectWithValue }) => {
    try {
      const status = await get<ReserveStatus>('/rms/proof-of-reserves');
      return status;
    } catch (error: any) {
      const mockStatus = mockGetReserveStatus();
      return rejectWithValue({
        error: error.message || 'Failed to fetch reserve status',
        mockData: mockStatus
      });
    }
  }
);

/**
 * Get Liquidity Sources
 */
export const fetchLiquiditySources = createAsyncThunk(
  'conversion/fetchLiquiditySources',
  async ({ from, to }: { from: string; to: string }, { rejectWithValue }) => {
    try {
      const sources = await get<{ data: LiquiditySource[] }>(`/liquidity/sources?from=${from}&to=${to}`);
      return sources.data;
    } catch (error: any) {
      const mockSources = mockGetLiquiditySources();
      return rejectWithValue({
        error: error.message || 'Failed to fetch liquidity sources',
        mockData: mockSources
      });
    }
  }
);

/**
 * Get Order Book Depth
 */
export const fetchOrderBookDepth = createAsyncThunk(
  'conversion/fetchOrderBookDepth',
  async ({ from, to }: { from: string; to: string }, { rejectWithValue }) => {
    try {
      const depth = await get<OrderBookDepth>(`/liquidity/depth?from=${from}&to=${to}`);
      return depth;
    } catch (error: any) {
      const mockDepth = mockGetOrderBookDepth(from, to);
      return rejectWithValue({
        error: error.message || 'Failed to fetch order book depth',
        mockData: mockDepth
      });
    }
  }
);

/**
 * Get Stablecoin Balance (USD-X across all chains)
 */
export const fetchStablecoinBalance = createAsyncThunk(
  'conversion/fetchStablecoinBalance',
  async (_, { rejectWithValue }) => {
    try {
      const balance = await get<StablecoinBalance>('/stablecoin/balance');
      return balance;
    } catch (error: any) {
      const mockBalance = mockGetStablecoinBalance();
      return rejectWithValue({
        error: error.message || 'Failed to fetch stablecoin balance',
        mockData: mockBalance
      });
    }
  }
);

/**
 * Check Conversion Limits based on KYC
 */
export const checkConversionLimits = createAsyncThunk(
  'conversion/checkConversionLimits',
  async ({ amount, currency }: { amount: number; currency: string }, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { conversion: ConversionState };
      const kyc = state.conversion.kycStatus;
      
      if (!kyc) {
        return rejectWithValue({
          allowed: false,
          reason: 'KYC status not available',
        });
      }

      if (amount > kyc.limits.singleTransactionLimit) {
        return {
          allowed: false,
          reason: `Transaction limit exceeded. Maximum: ${kyc.limits.singleTransactionLimit}`,
          upgradeRequired: kyc.level < 3,
        };
      }

      if (kyc.limits.remainingDaily !== undefined && amount > kyc.limits.remainingDaily) {
        return {
          allowed: false,
          reason: `Daily limit exceeded. Remaining: ${kyc.limits.remainingDaily}`,
          upgradeRequired: kyc.level < 3,
        };
      }

      return { allowed: true };
    } catch (error: any) {
      return rejectWithValue({
        allowed: false,
        reason: error.message || 'Failed to check limits',
      });
    }
  }
);

// ============ SLICE ============

const conversionSlice = createSlice({
  name: 'conversion',
  initialState,
  reducers: {
    /**
     * Clear current quote
     */
    clearQuote: (state) => {
      state.currentQuote = null;
      state.errors.quote = null;
      conversionClient.clearQuoteCache();
    },

    /**
     * Reset conversion state
     */
    resetConversion: (state) => {
      state.currentQuote = null;
      state.currentTransaction = null;
      state.transactionStatus = null;
      state.errors.quote = null;
      state.errors.confirmation = null;
      state.errors.transactionStatus = null;
      conversionClient.clearQuoteCache();
    },

    /**
     * Update transaction status (for WebSocket updates)
     */
    updateTransactionStatus: (state, action: PayloadAction<TransactionStatusUpdate>) => {
      state.transactionStatus = action.payload.status;
      state.errors.transactionStatus = null;
      
      // Update current transaction if it matches
      if (state.currentTransaction?.transactionId === action.payload.transactionId) {
        state.currentTransaction.status = action.payload.status;
        if (action.payload.status === 'completed') {
          state.currentTransaction.completedAt = action.payload.updatedAt;
        }
      }
    },

    /**
     * Clear specific error
     */
    clearError: (state, action: PayloadAction<keyof ConversionState['errors']>) => {
      state.errors[action.payload] = null;
    },

    /**
     * Handle WebSocket transaction updates
     */
    handleWebSocketTransactionUpdate: (state, action: PayloadAction<TransactionStatusUpdate>) => {
      state.transactionStatus = action.payload.status;
      state.errors.transactionStatus = null;
      
      // Update current transaction if it matches
      if (state.currentTransaction?.transactionId === action.payload.transactionId) {
        state.currentTransaction.status = action.payload.status;
        if (action.payload.status === 'completed') {
          state.currentTransaction.completedAt = action.payload.updatedAt;
        }
      }
    },
  },
  extraReducers: (builder) => {
    // ========== FETCH CURRENCIES ==========
    builder
      .addCase(fetchCurrencies.pending, (state) => {
        state.loading.currencies = true;
        state.errors.currencies = null;
      })
      .addCase(fetchCurrencies.fulfilled, (state, action) => {
        state.loading.currencies = false;
        state.currencies = action.payload;
      })
      .addCase(fetchCurrencies.rejected, (state, action) => {
        state.loading.currencies = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.currencies = action.payload.mockData as Currency[];
          state.errors.currencies = (action.payload as any).error as string;
        } else {
          state.errors.currencies = action.payload as string;
        }
      });

    // ========== FETCH WALLETS ==========
    builder
      .addCase(fetchWallets.pending, (state) => {
        state.loading.wallets = true;
        state.errors.wallets = null;
      })
      .addCase(fetchWallets.fulfilled, (state, action) => {
        state.loading.wallets = false;
        state.wallets = action.payload;
      })
      .addCase(fetchWallets.rejected, (state, action) => {
        state.loading.wallets = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.wallets = action.payload.mockData as Wallet[];
          state.errors.wallets = (action.payload as any).error as string;
        } else {
          state.errors.wallets = action.payload as string;
        }
      });

    // ========== FETCH KYC STATUS ==========
    builder
      .addCase(fetchKYCStatus.pending, (state) => {
        state.loading.kycStatus = true;
        state.errors.kycStatus = null;
      })
      .addCase(fetchKYCStatus.fulfilled, (state, action) => {
        state.loading.kycStatus = false;
        state.kycStatus = action.payload;
      })
      .addCase(fetchKYCStatus.rejected, (state, action) => {
        state.loading.kycStatus = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.kycStatus = action.payload.mockData as KYCData;
          state.errors.kycStatus = (action.payload as any).error as string;
        } else {
          state.errors.kycStatus = action.payload as string;
        }
      });

    // ========== FETCH TRANSACTION HISTORY ==========
    builder
      .addCase(fetchTransactionHistory.pending, (state) => {
        state.loading.history = true;
        state.errors.history = null;
      })
      .addCase(fetchTransactionHistory.fulfilled, (state, action) => {
        state.loading.history = false;
        state.transactionHistory = action.payload;
      })
      .addCase(fetchTransactionHistory.rejected, (state, action) => {
        state.loading.history = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.transactionHistory = action.payload.mockData as TransactionHistory[];
          state.errors.history = (action.payload as any).error as string;
        } else {
          state.errors.history = action.payload as string;
        }
      });

    // ========== GET QUOTE ==========
    builder
      .addCase(getConversionQuote.pending, (state) => {
        state.loading.quote = true;
        state.errors.quote = null;
      })
      .addCase(getConversionQuote.fulfilled, (state, action) => {
        state.loading.quote = false;
        const quote = 'quote' in action.payload
          ? action.payload.quote
          : action.payload;
        state.currentQuote = quote;

        // Update cache if cacheKey is provided
        if ('cacheKey' in action.payload && action.payload.cacheKey) {
          state.quoteCache[action.payload.cacheKey] = {
            quote,
            cachedAt: Date.now()
          };
        }

        // Auto-expire quote after TTL
        const expiresAt = new Date(quote.expiresAt).getTime();
        const now = Date.now();
        const ttl = Math.max(0, expiresAt - now);

        if (ttl > 0) {
          // Note: In real app, use middleware or side effect for this
          setTimeout(() => {
            // This won't work in Redux directly, handle in component
          }, ttl);
        }
      })
      .addCase(getConversionQuote.rejected, (state, action) => {
        state.loading.quote = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          const quote = (action.payload.mockData as QuoteResponse).data as ConversionQuote;
          state.currentQuote = quote;
          state.errors.quote = (action.payload as any).error as string;
          
          // Cache the mock quote as well
          const cacheKey = `${quote.fromCurrency}_${quote.toCurrency}_${quote.fromAmount}`;
          state.quoteCache[cacheKey] = {
            quote,
            cachedAt: Date.now()
          };
        } else {
          state.errors.quote = action.payload as string;
        }
      });

    // ========== CONFIRM CONVERSION ==========
    builder
      .addCase(confirmConversion.pending, (state) => {
        state.loading.confirmation = true;
        state.errors.confirmation = null;
      })
      .addCase(confirmConversion.fulfilled, (state, action) => {
        state.loading.confirmation = false;
        state.currentTransaction = action.payload;
        state.transactionStatus = action.payload.status;
      })
      .addCase(confirmConversion.rejected, (state, action) => {
        state.loading.confirmation = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          const transaction = (action.payload.mockData as ConversionResponse).data as ConversionConfirmation;
          state.currentTransaction = transaction;
          state.transactionStatus = transaction.status; // CRITICAL: Also set the status
          state.errors.confirmation = (action.payload as any).error as string;
        } else {
          state.errors.confirmation = action.payload as string;
        }
      });

    // ========== FETCH TRANSACTION STATUS ==========
    builder
      .addCase(fetchTransactionStatus.pending, (state) => {
        state.loading.transactionStatus = true;
        state.errors.transactionStatus = null;
      })
      .addCase(fetchTransactionStatus.fulfilled, (state, action) => {
        state.loading.transactionStatus = false;
        state.transactionStatus = action.payload.status;
      })
      .addCase(fetchTransactionStatus.rejected, (state, action) => {
        state.loading.transactionStatus = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.transactionStatus = action.payload.mockData as TransactionStatus;
          state.errors.transactionStatus = (action.payload as any).error as string;
        } else {
          state.errors.transactionStatus = action.payload as string;
        }
      });

    // ========== FETCH RESERVE STATUS ==========
    builder
      .addCase(fetchReserveStatus.pending, (state) => {
        state.loading.reserveStatus = true;
        state.errors.reserveStatus = null;
      })
      .addCase(fetchReserveStatus.fulfilled, (state, action) => {
        state.loading.reserveStatus = false;
        state.reserveStatus = action.payload;
      })
      .addCase(fetchReserveStatus.rejected, (state, action) => {
        state.loading.reserveStatus = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.reserveStatus = action.payload.mockData as ReserveStatus;
          state.errors.reserveStatus = (action.payload as any).error as string;
        } else {
          state.errors.reserveStatus = action.payload as string;
        }
      });

    // ========== FETCH LIQUIDITY SOURCES ==========
    builder
      .addCase(fetchLiquiditySources.pending, (state) => {
        state.loading.liquiditySources = true;
        state.errors.liquiditySources = null;
      })
      .addCase(fetchLiquiditySources.fulfilled, (state, action) => {
        state.loading.liquiditySources = false;
        state.liquiditySources = action.payload;
      })
      .addCase(fetchLiquiditySources.rejected, (state, action) => {
        state.loading.liquiditySources = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.liquiditySources = action.payload.mockData as LiquiditySource[];
          state.errors.liquiditySources = (action.payload as any).error as string;
        } else {
          state.errors.liquiditySources = action.payload as string;
        }
      });

    // ========== FETCH ORDER BOOK DEPTH ==========
    builder
      .addCase(fetchOrderBookDepth.pending, (state) => {
        state.loading.orderBookDepth = true;
        state.errors.orderBookDepth = null;
      })
      .addCase(fetchOrderBookDepth.fulfilled, (state, action) => {
        state.loading.orderBookDepth = false;
        state.orderBookDepth = action.payload;
      })
      .addCase(fetchOrderBookDepth.rejected, (state, action) => {
        state.loading.orderBookDepth = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.orderBookDepth = action.payload.mockData as OrderBookDepth;
          state.errors.orderBookDepth = (action.payload as any).error as string;
        } else {
          state.errors.orderBookDepth = action.payload as string;
        }
      });

    // ========== FETCH STABLECOIN BALANCE ==========
    builder
      .addCase(fetchStablecoinBalance.pending, (state) => {
        state.loading.stablecoinBalance = true;
        state.errors.stablecoinBalance = null;
      })
      .addCase(fetchStablecoinBalance.fulfilled, (state, action) => {
        state.loading.stablecoinBalance = false;
        state.stablecoinBalance = action.payload;
      })
      .addCase(fetchStablecoinBalance.rejected, (state, action) => {
        state.loading.stablecoinBalance = false;
        
        if (action.payload && typeof action.payload === 'object' && 'mockData' in action.payload) {
          state.stablecoinBalance = action.payload.mockData as StablecoinBalance;
          state.errors.stablecoinBalance = (action.payload as any).error as string;
        } else {
          state.errors.stablecoinBalance = action.payload as string;
        }
      });
  },
});

// Export actions
export const { clearQuote, resetConversion, updateTransactionStatus, clearError, handleWebSocketTransactionUpdate } =
  conversionSlice.actions;

// Export reducer
export default conversionSlice.reducer;
