import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { DampWallet } from '../../../types/wallet/dampWallet';
import type { Transaction } from '../../../types/transactions/dampTransaction';
import { get } from '../../../api';

/**
 * Mirrors services/bff/src/dashboard/dashboard.controller.ts's DashboardView
 * exactly: `{wallets, recentTransactions}`, one call. There is no
 * cards/portfolio/quickActions/alerts/chart endpoint (and no service that
 * could compute gain/loss, spend-by-category or account-health alerts —
 * this platform has no such data), so this slice doesn't invent state for
 * them the way the old mock-backed version did.
 */
export interface DashboardState {
  wallets: DampWallet[];
  recentTransactions: Transaction[];
  loading: boolean;
  error: string | null;
}

const initialState: DashboardState = {
  wallets: [],
  recentTransactions: [],
  loading: false,
  error: null,
};

function errorMessage(error: unknown, fallback: string): string {
  const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
  return message || (error instanceof Error ? error.message : fallback);
}

export const fetchDashboard = createAsyncThunk<
  { wallets: DampWallet[]; recentTransactions: Transaction[] },
  void,
  { rejectValue: string }
>('dashboard/fetchDashboard', async (_, { rejectWithValue }) => {
  try {
    return await get<{ wallets: DampWallet[]; recentTransactions: Transaction[] }>('/dashboard');
  } catch (error) {
    return rejectWithValue(errorMessage(error, 'Failed to fetch dashboard data'));
  }
});

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    clearDashboardError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchDashboard.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboard.fulfilled, (state, action) => {
        state.loading = false;
        state.wallets = action.payload.wallets;
        state.recentTransactions = action.payload.recentTransactions;
      })
      .addCase(fetchDashboard.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload ?? 'Failed to fetch dashboard data';
      });
  },
});

export const selectDashboardWallets = (state: { dashboard: DashboardState }) => state.dashboard.wallets;
export const selectDashboardRecentTransactions = (state: { dashboard: DashboardState }) =>
  state.dashboard.recentTransactions;
export const selectDashboardLoading = (state: { dashboard: DashboardState }) => state.dashboard.loading;
export const selectDashboardError = (state: { dashboard: DashboardState }) => state.dashboard.error;

export const { clearDashboardError } = dashboardSlice.actions;
export default dashboardSlice.reducer;
