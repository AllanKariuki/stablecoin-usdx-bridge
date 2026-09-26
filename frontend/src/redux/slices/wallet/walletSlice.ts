import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { DampWallet, WalletState, WalletStatement } from '../../../types/wallet/dampWallet';
import type { Transaction } from '../../../types/transactions/dampTransaction';
import { get, post, axiosInstance } from '../../../api';

const initialState: WalletState = {
  wallets: [],
  selectedWalletId: null,
  statementsByWalletId: {},
  loading: false,
  error: null,
  moneyMovement: {
    submitting: false,
    error: null,
  },
};

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || (error instanceof Error ? error.message : fallback);
}

/**
 * GET /wallets — bff's WalletsController.listOwn. No mock fallback: a
 * failed request is a real error the UI must surface, not a reason to show
 * invented balances.
 */
export const fetchWallets = createAsyncThunk<DampWallet[], void, { rejectValue: string }>(
  'wallet/fetchWallets',
  async (_, { rejectWithValue }) => {
    try {
      return await get<DampWallet[]>('/wallets');
    } catch (error) {
      return rejectWithValue(errorMessage(error, 'Failed to fetch wallets'));
    }
  },
);

export const fetchWalletStatement = createAsyncThunk<
  { walletId: string; statement: WalletStatement },
  { walletId: string; from?: string; to?: string; limit?: number },
  { rejectValue: string }
>('wallet/fetchWalletStatement', async ({ walletId, from, to, limit }, { rejectWithValue }) => {
  try {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (limit) query.set('limit', String(limit));
    const suffix = query.toString() ? `?${query.toString()}` : '';
    const statement = await get<WalletStatement>(`/wallets/${walletId}/statement${suffix}`);
    return { walletId, statement };
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Failed to fetch wallet statement'));
  }
});

interface MoneyMovementInput {
  amount: string;
  reference?: string;
}

/**
 * Idempotency-Key is generated once per submission and reused across
 * axios's automatic retries (none are configured today, but this is the
 * seam), matching core-ledger's requirement that the caller — not the
 * gateway — control the key across a retried request.
 */
function idempotencyHeaders() {
  return { headers: { 'Idempotency-Key': crypto.randomUUID() } };
}

export const depositToWallet = createAsyncThunk<
  Transaction,
  MoneyMovementInput & { walletId: string },
  { rejectValue: string }
>('wallet/deposit', async ({ walletId, amount, reference }, { rejectWithValue }) => {
  try {
    const response = await axiosInstance.post<Transaction>(
      '/deposits',
      { walletId, amount, reference },
      idempotencyHeaders(),
    );
    return response.data;
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Deposit failed'));
  }
});

export const withdrawFromWallet = createAsyncThunk<
  Transaction,
  MoneyMovementInput & { walletId: string },
  { rejectValue: string }
>('wallet/withdraw', async ({ walletId, amount, reference }, { rejectWithValue }) => {
  try {
    const response = await axiosInstance.post<Transaction>(
      '/withdrawals',
      { walletId, amount, reference },
      idempotencyHeaders(),
    );
    return response.data;
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Withdrawal failed'));
  }
});

export const transferBetweenWallets = createAsyncThunk<
  Transaction,
  MoneyMovementInput & { fromWalletId: string; toWalletId: string },
  { rejectValue: string }
>('wallet/transfer', async ({ fromWalletId, toWalletId, amount, reference }, { rejectWithValue }) => {
  try {
    const response = await axiosInstance.post<Transaction>(
      '/transfers',
      { fromWalletId, toWalletId, amount, reference },
      idempotencyHeaders(),
    );
    return response.data;
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Transfer failed'));
  }
});

/** POST /wallets/:id/status — operator-only (wallets:status:manage). */
export const setWalletStatus = createAsyncThunk<
  DampWallet,
  { walletId: string; status: string },
  { rejectValue: string }
>('wallet/setStatus', async ({ walletId, status }, { rejectWithValue }) => {
  try {
    return await post<DampWallet, { status: string }>(`/wallets/${walletId}/status`, { status });
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Failed to update wallet status'));
  }
});

const walletSlice = createSlice({
  name: 'wallet',
  initialState,
  reducers: {
    selectWallet: (state, action: { payload: string | null }) => {
      state.selectedWalletId = action.payload;
    },
    clearWalletError: (state) => {
      state.error = null;
    },
    clearMoneyMovementError: (state) => {
      state.moneyMovement.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchWallets.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchWallets.fulfilled, (state, action) => {
        state.loading = false;
        state.wallets = action.payload;
        if (!state.selectedWalletId && action.payload.length > 0) {
          state.selectedWalletId = action.payload[0].id;
        }
      })
      .addCase(fetchWallets.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to fetch wallets';
      })

      .addCase(fetchWalletStatement.fulfilled, (state, action) => {
        state.statementsByWalletId[action.payload.walletId] = action.payload.statement;
      })
      .addCase(fetchWalletStatement.rejected, (state, action) => {
        state.error = action.payload ?? 'Failed to fetch wallet statement';
      })

      .addCase(setWalletStatus.fulfilled, (state, action) => {
        const index = state.wallets.findIndex((w) => w.id === action.payload.id);
        if (index !== -1) state.wallets[index] = action.payload;
      });

    for (const thunk of [depositToWallet, withdrawFromWallet, transferBetweenWallets]) {
      builder
        .addCase(thunk.pending, (state) => {
          state.moneyMovement.submitting = true;
          state.moneyMovement.error = null;
        })
        .addCase(thunk.fulfilled, (state) => {
          state.moneyMovement.submitting = false;
        })
        .addCase(thunk.rejected, (state, action) => {
          state.moneyMovement.submitting = false;
          state.moneyMovement.error = action.payload ?? 'Money movement failed';
        });
    }
  },
});

export const selectWallets = (state: { wallet: WalletState }) => state.wallet.wallets;
export const selectSelectedWalletId = (state: { wallet: WalletState }) => state.wallet.selectedWalletId;
export const selectSelectedWallet = (state: { wallet: WalletState }) =>
  state.wallet.wallets.find((w) => w.id === state.wallet.selectedWalletId) ?? null;
export const selectWalletStatement = (walletId: string) => (state: { wallet: WalletState }) =>
  state.wallet.statementsByWalletId[walletId] ?? null;
export const selectWalletLoading = (state: { wallet: WalletState }) => state.wallet.loading;
export const selectWalletError = (state: { wallet: WalletState }) => state.wallet.error;
export const selectMoneyMovement = (state: { wallet: WalletState }) => state.wallet.moneyMovement;

export const { selectWallet, clearWalletError, clearMoneyMovementError } = walletSlice.actions;
export default walletSlice.reducer;
