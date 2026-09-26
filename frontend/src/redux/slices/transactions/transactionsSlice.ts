import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { Transaction, TransactionPage, TransactionsState } from '../../../types/transactions/dampTransaction';
import { get } from '../../../api';

const initialState: TransactionsState = {
  items: [],
  nextCursor: null,
  selectedTransaction: null,
  loading: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || (error instanceof Error ? error.message : fallback);
}

/**
 * GET /transactions — bff's cross-wallet feed, cursor-paginated (see
 * services/bff/src/transactions/transactions.service.ts). `append: true`
 * grows `items` for "load more"; the default (a fresh filter/search) resets
 * the list.
 */
export const fetchTransactions = createAsyncThunk<
  TransactionPage,
  { cursor?: string; limit?: number } | undefined,
  { rejectValue: string }
>('transactions/fetchTransactions', async (params, { rejectWithValue }) => {
  try {
    const query = new URLSearchParams();
    if (params?.cursor) query.set('cursor', params.cursor);
    if (params?.limit) query.set('limit', String(params.limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    return await get<TransactionPage>(`/transactions${suffix}`);
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Failed to fetch transactions'));
  }
});

export const fetchTransactionById = createAsyncThunk<Transaction, string, { rejectValue: string }>(
  'transactions/fetchTransactionById',
  async (id, { rejectWithValue }) => {
    try {
      return await get<Transaction>(`/transactions/${id}`);
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to fetch transaction'));
    }
  },
);

const transactionsSlice = createSlice({
  name: 'transactions',
  initialState,
  reducers: {
    selectTransaction: (state, action: { payload: Transaction | null }) => {
      state.selectedTransaction = action.payload;
    },
    clearTransactionsError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.items = action.payload.transactions;
        state.nextCursor = action.payload.nextCursor || null;
      })
      .addCase(fetchTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to fetch transactions';
      })

      .addCase(fetchTransactionById.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchTransactionById.fulfilled, (state, action) => {
        state.loading = false;
        state.selectedTransaction = action.payload;
      })
      .addCase(fetchTransactionById.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to fetch transaction';
      });
  },
});

export const selectTransactions = (state: { transactions: TransactionsState }) => state.transactions.items;
export const selectTransactionsNextCursor = (state: { transactions: TransactionsState }) =>
  state.transactions.nextCursor;
export const selectSelectedTransaction = (state: { transactions: TransactionsState }) =>
  state.transactions.selectedTransaction;
export const selectTransactionsLoading = (state: { transactions: TransactionsState }) => state.transactions.loading;
export const selectTransactionsError = (state: { transactions: TransactionsState }) => state.transactions.error;

export const { selectTransaction, clearTransactionsError } = transactionsSlice.actions;
export default transactionsSlice.reducer;
