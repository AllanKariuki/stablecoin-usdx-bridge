import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type { TransactionHistory } from '../../../types/financial';
import type { TransactionsState } from '../../../types/transactions/transactions';
import { mockTransactions } from '../../../types/transactions/transactions';
import { get, post, put } from '../../../api';

const initialState: TransactionsState = {
  transactions: [],
  filteredTransactions: [],
  selectedTransaction: null,
  filters: {},
  searchTerm: '',
  loading: false,
  error: null,
  currentPage: 1,
  itemsPerPage: 25,
  totalCount: 0
};

// Async thunks
export const fetchTransactions = createAsyncThunk(
  'transactions/fetchTransactions',
  async (params?: { page?: number; limit?: number; filters?: any }) => {
    try {
      const { page = 1, limit = 25, filters = {} } = params || {};
      const queryParams = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
        ...Object.fromEntries(
          Object.entries(filters).filter(([, value]) => value !== '' && value !== undefined)
        )
      });

      const response = await get(`/transactions?${queryParams}`);
      return response as { data: TransactionHistory[]; total: number };
    } catch (error: any) {
      console.warn('API failed for transactions, using mock data:', error);
      return { data: mockTransactions, total: mockTransactions.length };
    }
  }
);

export const fetchTransactionById = createAsyncThunk(
  'transactions/fetchTransactionById',
  async (id: string) => {
    try {
      const response = await get(`/transactions/${id}`);
      return response as { data: TransactionHistory };
    } catch (error: any) {
      console.warn(`API failed for transaction ${id}, using mock:`, error);
      const mockTransaction = mockTransactions.find(t => t.id === id);
      if (!mockTransaction) {
        throw new Error(`Transaction ${id} not found`);
      }
      return { data: mockTransaction };
    }
  }
);

export const updateTransaction = createAsyncThunk(
  'transactions/updateTransaction',
  async ({ id, updates }: { id: string; updates: Partial<TransactionHistory> }) => {
    try {
      const response = await put(`/transactions/${id}`, updates);
      return response as { data: TransactionHistory };
    } catch (error: any) {
      console.warn(`API failed updating transaction ${id}, using mock:`, error);
      return { data: { id, ...updates } as TransactionHistory };
    }
  }
);

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    selectTransaction: (state, action: PayloadAction<TransactionHistory | null>) => {
      state.selectedTransaction = action.payload;
    },
    setFilters: (state, action: PayloadAction<any>) => {
      state.filters = action.payload;
    },
    setSearchTerm: (state, action: PayloadAction<string>) => {
      state.searchTerm = action.payload;
    },
    setCurrentPage: (state, action: PayloadAction<number>) => {
      state.currentPage = action.payload;
    },
    setItemsPerPage: (state, action: PayloadAction<number>) => {
      state.itemsPerPage = action.payload;
      state.currentPage = 1;
    },
    applyFilters: (state) => {
      let filtered = [...state.transactions];

      // Apply search term
      if (state.searchTerm) {
        const searchLower = state.searchTerm.toLowerCase();
        filtered = filtered.filter(
          (tx) =>
            tx.description?.toLowerCase().includes(searchLower) ||
            tx.counterpartyName?.toLowerCase().includes(searchLower) ||
            tx.reference?.toLowerCase().includes(searchLower)
        );
      }

      // Apply filters
      if (state.filters.type) {
        filtered = filtered.filter((tx) => tx.type === state.filters.type);
      }
      if (state.filters.status) {
        filtered = filtered.filter((tx) => tx.status === state.filters.status);
      }
      if (state.filters.minAmount) {
        filtered = filtered.filter((tx) => tx.amount >= state.filters.minAmount);
      }
      if (state.filters.maxAmount) {
        filtered = filtered.filter((tx) => tx.amount <= state.filters.maxAmount);
      }
      if (state.filters.dateFrom) {
        const fromDate = new Date(state.filters.dateFrom);
        filtered = filtered.filter((tx) => new Date(tx.createdAt) >= fromDate);
      }
      if (state.filters.dateTo) {
        const toDate = new Date(state.filters.dateTo);
        filtered = filtered.filter((tx) => new Date(tx.createdAt) <= toDate);
      }

      state.filteredTransactions = filtered;
    },
    clearFilters: (state) => {
      state.filters = {};
      state.searchTerm = '';
      state.filteredTransactions = state.transactions;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch transactions
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.transactions = action.payload.data;
        state.totalCount = action.payload.total;
        transactionsSlice.caseReducers.applyFilters(state);
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch transactions';
      })

      // Fetch transaction by ID
      .addCase(fetchTransactionById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactionById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTransaction = action.payload.data;
      })
      .addCase(fetchTransactionById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch transaction';
      })

      // Update transaction
      .addCase(updateTransaction.fulfilled, (state, action) => {
        const index = state.transactions.findIndex(
          (tx) => tx.id === action.payload.data.id
        );
        if (index !== -1) {
          state.transactions[index] = action.payload.data;
        }
        if (state.selectedTransaction?.id === action.payload.data.id) {
          state.selectedTransaction = action.payload.data;
        }
        transactionsSlice.caseReducers.applyFilters(state);
      });
  }
});

// Selectors
export const selectTransactions = (state: { transactions: TransactionsState }) =>
  state.transactions.filteredTransactions;
export const selectAllTransactions = (state: { transactions: TransactionsState }) =>
  state.transactions.transactions;
export const selectSelectedTransaction = (state: { transactions: TransactionsState }) =>
  state.transactions.selectedTransaction;
export const selectTransactionsLoading = (state: { transactions: TransactionsState }) =>
  state.transactions.loading;
export const selectTransactionsError = (state: { transactions: TransactionsState }) =>
  state.transactions.error;
export const selectTransactionsPagination = (state: { transactions: TransactionsState }) => ({
  currentPage: state.transactions.currentPage,
  itemsPerPage: state.transactions.itemsPerPage,
  totalCount: state.transactions.totalCount
});
export const selectTransactionsFilters = (state: { transactions: TransactionsState }) =>
  state.transactions.filters;
export const selectTransactionsSearchTerm = (state: { transactions: TransactionsState }) =>
  state.transactions.searchTerm;

export const {
  selectTransaction,
  setFilters,
  setSearchTerm,
  setCurrentPage,
  setItemsPerPage,
  applyFilters,
  clearFilters,
  clearError
} = transactionsSlice.actions;

export default transactionsSlice.reducer;
