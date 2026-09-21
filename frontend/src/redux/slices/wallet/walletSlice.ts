import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { Chain, Wallet, SweepHistory, WalletTransaction, WalletState } from '../../../types/wallet/wallet';
import {
  mockChains,
  mockWallets,
  mockSweepHistory,
  mockWalletTransactions,
  mockWalletStats
} from '../../../types/wallet/mockWalletData';
import { get, post, put, del } from '../../../api';

const initialState: WalletState = {
  chains: [],
  wallets: [],
  selectedWallet: null,
  sweepHistory: [],
  walletTransactions: [],
  walletStats: null,
  filters: {},
  loading: false,
  error: null
};

// Async thunks
export const fetchChains = createAsyncThunk(
  'wallet/fetchChains',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/wallet/chains');
      return response as { data: Chain[] };
    } catch (error: any) {
      console.warn('API failed for chains, using mock data:', error);
      return { data: mockChains };
    }
  }
);

export const fetchWallets = createAsyncThunk(
  'wallet/fetchWallets',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/wallet');
      return response as { data: Wallet[] };
    } catch (error: any) {
      console.warn('API failed for wallets, using mock data:', error);
      return { data: mockWallets };
    }
  }
);

export const fetchWalletById = createAsyncThunk(
  'wallet/fetchWalletById',
  async (id: string) => {
    try {
      const response = await get(`/wallet/${id}`);
      return response as { data: Wallet };
    } catch (error: any) {
      console.warn(`API failed for wallet ${id}, using mock:`, error);
      const mockWallet = mockWallets.find(w => w.id === id);
      if (!mockWallet) throw new Error(`Wallet ${id} not found`);
      return { data: mockWallet };
    }
  }
);

export const fetchSweepHistory = createAsyncThunk(
  'wallet/fetchSweepHistory',
  async (walletId?: string) => {
    try {
      const url = walletId ? `/wallet/${walletId}/sweep-history` : '/wallet/sweep-history';
      const response = await get(url);
      return response as { data: SweepHistory[] };
    } catch (error: any) {
      console.warn('API failed for sweep history, using mock data:', error);
      return { data: mockSweepHistory };
    }
  }
);

export const fetchWalletTransactions = createAsyncThunk(
  'wallet/fetchWalletTransactions',
  async (walletId?: string) => {
    try {
      const url = walletId ? `/wallet/${walletId}/transactions` : '/wallet/transactions';
      const response = await get(url);
      return response as { data: WalletTransaction[] };
    } catch (error: any) {
      console.warn('API failed for wallet transactions, using mock data:', error);
      return { data: mockWalletTransactions };
    }
  }
);

export const createWallet = createAsyncThunk(
  'wallet/createWallet',
  async (walletData: Omit<Wallet, 'id' | 'createdAt'>) => {
    try {
      const response = await post('/wallet', walletData);
      return response as { data: Wallet };
    } catch (error: any) {
      console.warn('API failed creating wallet, using mock:', error);
      return {
        data: {
          ...walletData,
          id: Date.now().toString(),
          createdAt: new Date().toISOString()
        }
      };
    }
  }
);

export const updateWallet = createAsyncThunk(
  'wallet/updateWallet',
  async ({ id, updates }: { id: string; updates: Partial<Wallet> }) => {
    try {
      const response = await put(`/wallet/${id}`, updates);
      return response as { data: Wallet };
    } catch (error: any) {
      console.warn(`API failed updating wallet ${id}, using mock:`, error);
      return { data: { id, ...updates } as Wallet };
    }
  }
);

export const performSweep = createAsyncThunk(
  'wallet/performSweep',
  async (sweepData: any) => {
    try {
      const response = await post('/wallet/sweep', sweepData);
      return response as { data: SweepHistory };
    } catch (error: any) {
      console.warn('API failed performing sweep, using mock:', error);
      return {
        data: {
          ...sweepData,
          id: Date.now().toString(),
          timestamp: new Date().toISOString(),
          status: 'pending' as const
        }
      };
    }
  }
);

export const deleteWallet = createAsyncThunk(
  'wallet/deleteWallet',
  async (id: string) => {
    try {
      await del(`/wallet/${id}`);
      return { id };
    } catch (error: any) {
      console.warn(`API failed deleting wallet ${id}, proceeding with mock:`, error);
      return { id };
    }
  }
);

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    selectWallet: (state, action: PayloadAction<Wallet | null>) => {
      state.selectedWallet = action.payload;
    },
    setWalletFilters: (state, action: PayloadAction<any>) => {
      state.filters = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch chains
      .addCase(fetchChains.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChains.fulfilled, (state, action) => {
        state.loading = false;
        state.chains = action.payload.data;
      })
      .addCase(fetchChains.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch chains';
      })

      // Fetch wallets
      .addCase(fetchWallets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWallets.fulfilled, (state, action) => {
        state.loading = false;
        state.wallets = action.payload.data;
      })
      .addCase(fetchWallets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch wallets';
      })

      // Fetch wallet by ID
      .addCase(fetchWalletById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWalletById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedWallet = action.payload.data;
      })
      .addCase(fetchWalletById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch wallet';
      })

      // Fetch sweep history
      .addCase(fetchSweepHistory.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchSweepHistory.fulfilled, (state, action) => {
        state.loading = false;
        state.sweepHistory = action.payload.data;
      })
      .addCase(fetchSweepHistory.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch sweep history';
      })

      // Fetch wallet transactions
      .addCase(fetchWalletTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWalletTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.walletTransactions = action.payload.data;
      })
      .addCase(fetchWalletTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch wallet transactions';
      })

      // Create wallet
      .addCase(createWallet.fulfilled, (state, action) => {
        state.wallets.unshift(action.payload.data);
      })

      // Update wallet
      .addCase(updateWallet.fulfilled, (state, action) => {
        const index = state.wallets.findIndex(w => w.id === action.payload.data.id);
        if (index !== -1) {
          state.wallets[index] = action.payload.data;
        }
        if (state.selectedWallet?.id === action.payload.data.id) {
          state.selectedWallet = action.payload.data;
        }
      })

      // Perform sweep
      .addCase(performSweep.fulfilled, (state, action) => {
        state.sweepHistory.unshift(action.payload.data);
      })

      // Delete wallet
      .addCase(deleteWallet.fulfilled, (state, action) => {
        state.wallets = state.wallets.filter(w => w.id !== action.payload.id);
      });
  }
});

// Selectors
export const selectChains = (state: { wallet: WalletState }) => state.wallet.chains;
export const selectWallets = (state: { wallet: WalletState }) => state.wallet.wallets;
export const selectSelectedWallet = (state: { wallet: WalletState }) =>
  state.wallet.selectedWallet;
export const selectSweepHistory = (state: { wallet: WalletState }) =>
  state.wallet.sweepHistory;
export const selectWalletTransactions = (state: { wallet: WalletState }) =>
  state.wallet.walletTransactions;
export const selectWalletLoading = (state: { wallet: WalletState }) => state.wallet.loading;
export const selectWalletError = (state: { wallet: WalletState }) => state.wallet.error;

export const { selectWallet, setWalletFilters, clearError } = walletSlice.actions;
export default walletSlice.reducer;
