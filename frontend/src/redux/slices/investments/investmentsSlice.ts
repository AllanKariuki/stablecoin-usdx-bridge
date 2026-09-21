import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  Stock,
  Bond,
  MutualFund,
  CryptoAsset,
  InvestmentPortfolio,
  InvestmentPerformance,
  InvestmentsState
} from '../../../types/investments/investments';
import { get, post, put, del } from '../../../api';

// Mock data
const mockStocks: Stock[] = [
  {
    id: '1',
    symbol: 'AAPL',
    name: 'Apple Inc.',
    quantity: 10,
    purchasePrice: 150,
    currentPrice: 180,
    totalValue: 1800,
    gainLoss: 300,
    gainLossPercent: 20,
    purchaseDate: '2024-01-15'
  },
  {
    id: '2',
    symbol: 'GOOGL',
    name: 'Alphabet Inc.',
    quantity: 5,
    purchasePrice: 2800,
    currentPrice: 3100,
    totalValue: 15500,
    gainLoss: 1500,
    gainLossPercent: 10.7,
    purchaseDate: '2024-03-20'
  }
];

const mockBonds: Bond[] = [
  {
    id: '1',
    name: 'US Treasury Bond',
    issuer: 'US Government',
    quantity: 10,
    purchasePrice: 1000,
    currentPrice: 1020,
    maturityDate: '2030-12-31',
    couponRate: 4.5,
    totalValue: 10200,
    gainLoss: 200,
    gainLossPercent: 2
  }
];

const mockMutualFunds: MutualFund[] = [
  {
    id: '1',
    name: 'Growth Fund',
    fundManager: 'ABC Investments',
    units: 100,
    unitPrice: 50,
    totalValue: 5000,
    gainLoss: 500,
    gainLossPercent: 11,
    navDate: '2025-11-20',
    expenseRatio: 0.75
  }
];

const mockCryptoAssets: CryptoAsset[] = [
  {
    id: '1',
    symbol: 'BTC',
    name: 'Bitcoin',
    amount: 0.5,
    purchasePrice: 35000,
    currentPrice: 42000,
    totalValue: 21000,
    gainLoss: 3500,
    gainLossPercent: 20,
    purchaseDate: '2024-06-01'
  }
];

const mockPortfolio: InvestmentPortfolio = {
  id: '1',
  totalValue: 53500,
  totalInvested: 50000,
  totalGainLoss: 3500,
  gainLossPercent: 7,
  lastUpdated: '2025-11-20T10:30:00Z'
};

const mockPerformances: InvestmentPerformance[] = [
  {
    id: '1',
    period: 'YTD',
    totalReturn: 3500,
    annualReturn: 7,
    volatility: 12.5,
    sharpRatio: 0.56,
    maxDrawdown: -8.5,
    winningDays: 180,
    losingDays: 70
  }
];

const initialState: InvestmentsState = {
  stocks: [],
  bonds: [],
  mutualFunds: [],
  cryptoAssets: [],
  portfolio: null,
  performances: [],
  selectedStock: null,
  selectedBond: null,
  selectedFund: null,
  selectedCrypto: null,
  loading: false,
  error: null
};

// Async thunks
export const fetchStocks = createAsyncThunk(
  'investments/fetchStocks',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/investments/stocks');
      return response as { data: Stock[] };
    } catch (error: any) {
      console.warn('API failed for stocks, using mock data:', error);
      return { data: mockStocks };
    }
  }
);

export const fetchBonds = createAsyncThunk(
  'investments/fetchBonds',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/investments/bonds');
      return response as { data: Bond[] };
    } catch (error: any) {
      console.warn('API failed for bonds, using mock data:', error);
      return { data: mockBonds };
    }
  }
);

export const fetchMutualFunds = createAsyncThunk(
  'investments/fetchMutualFunds',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/investments/mutual-funds');
      return response as { data: MutualFund[] };
    } catch (error: any) {
      console.warn('API failed for mutual funds, using mock data:', error);
      return { data: mockMutualFunds };
    }
  }
);

export const fetchCryptoAssets = createAsyncThunk(
  'investments/fetchCryptoAssets',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/investments/crypto');
      return response as { data: CryptoAsset[] };
    } catch (error: any) {
      console.warn('API failed for crypto assets, using mock data:', error);
      return { data: mockCryptoAssets };
    }
  }
);

export const fetchPortfolio = createAsyncThunk(
  'investments/fetchPortfolio',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/investments/portfolio');
      return response as { data: InvestmentPortfolio };
    } catch (error: any) {
      console.warn('API failed for portfolio, using mock data:', error);
      return { data: mockPortfolio };
    }
  }
);

export const fetchPerformance = createAsyncThunk(
  'investments/fetchPerformance',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/investments/performance');
      return response as { data: InvestmentPerformance[] };
    } catch (error: any) {
      console.warn('API failed for performance, using mock data:', error);
      return { data: mockPerformances };
    }
  }
);

export const buyStock = createAsyncThunk(
  'investments/buyStock',
  async (stockData: Omit<Stock, 'id'>) => {
    try {
      const response = await post('/investments/stocks', stockData);
      return response as { data: Stock };
    } catch (error: any) {
      console.warn('API failed buying stock, using mock:', error);
      return {
        data: {
          ...stockData,
          id: Date.now().toString()
        }
      };
    }
  }
);

export const sellStock = createAsyncThunk(
  'investments/sellStock',
  async (id: string) => {
    try {
      await del(`/investments/stocks/${id}`);
      return { id };
    } catch (error: any) {
      console.warn(`API failed selling stock ${id}, proceeding with mock:`, error);
      return { id };
    }
  }
);

export const fetchStockDetails = createAsyncThunk(
  'investments/fetchStockDetails',
  async (stockId: string, { rejectWithValue }) => {
    try {
      const response = await get(`/investments/stocks/${stockId}`);
      return response as { data: Stock };
    } catch (error: any) {
      console.warn(`API failed fetching stock details for ${stockId}, using mock:`, error);
      const stock = mockStocks.find(s => s.id === stockId);
      return { data: stock || mockStocks[0] };
    }
  }
);

const investmentsSlice = createSlice({
  name: 'investments',
  initialState,
  reducers: {
    selectStock: (state, action: PayloadAction<Stock | null>) => {
      state.selectedStock = action.payload;
    },
    selectBond: (state, action: PayloadAction<Bond | null>) => {
      state.selectedBond = action.payload;
    },
    selectMutualFund: (state, action: PayloadAction<MutualFund | null>) => {
      state.selectedFund = action.payload;
    },
    selectCryptoAsset: (state, action: PayloadAction<CryptoAsset | null>) => {
      state.selectedCrypto = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch stocks
      .addCase(fetchStocks.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchStocks.fulfilled, (state, action) => {
        state.loading = false;
        state.stocks = action.payload.data;
      })
      .addCase(fetchStocks.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch stocks';
      })

      // Fetch bonds
      .addCase(fetchBonds.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchBonds.fulfilled, (state, action) => {
        state.loading = false;
        state.bonds = action.payload.data;
      })
      .addCase(fetchBonds.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch bonds';
      })

      // Fetch mutual funds
      .addCase(fetchMutualFunds.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchMutualFunds.fulfilled, (state, action) => {
        state.loading = false;
        state.mutualFunds = action.payload.data;
      })
      .addCase(fetchMutualFunds.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch mutual funds';
      })

      // Fetch crypto assets
      .addCase(fetchCryptoAssets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCryptoAssets.fulfilled, (state, action) => {
        state.loading = false;
        state.cryptoAssets = action.payload.data;
      })
      .addCase(fetchCryptoAssets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch crypto assets';
      })

      // Fetch portfolio
      .addCase(fetchPortfolio.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPortfolio.fulfilled, (state, action) => {
        state.loading = false;
        state.portfolio = action.payload.data;
      })
      .addCase(fetchPortfolio.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch portfolio';
      })

      // Fetch performance
      .addCase(fetchPerformance.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPerformance.fulfilled, (state, action) => {
        state.loading = false;
        state.performances = action.payload.data;
      })
      .addCase(fetchPerformance.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch performance';
      })

      // Buy stock
      .addCase(buyStock.fulfilled, (state, action) => {
        state.stocks.unshift(action.payload.data);
      })

      // Sell stock
      .addCase(sellStock.fulfilled, (state, action) => {
        state.stocks = state.stocks.filter(s => s.id !== action.payload.id);
      });
  }
});

// Selectors
export const selectStocks = (state: { investments: InvestmentsState }) =>
  state.investments.stocks;
export const selectBonds = (state: { investments: InvestmentsState }) =>
  state.investments.bonds;
export const selectMutualFunds = (state: { investments: InvestmentsState }) =>
  state.investments.mutualFunds;
export const selectCryptoAssets = (state: { investments: InvestmentsState }) =>
  state.investments.cryptoAssets;
export const selectInvestmentPortfolio = (state: { investments: InvestmentsState }) =>
  state.investments.portfolio;
export const selectInvestmentPerformance = (state: { investments: InvestmentsState }) =>
  state.investments.performances;
export const selectInvestmentsLoading = (state: { investments: InvestmentsState }) =>
  state.investments.loading;
export const selectInvestmentsError = (state: { investments: InvestmentsState }) =>
  state.investments.error;

export const { selectStock, selectBond, selectMutualFund, selectCryptoAsset, clearError } =
  investmentsSlice.actions;
export default investmentsSlice.reducer;
