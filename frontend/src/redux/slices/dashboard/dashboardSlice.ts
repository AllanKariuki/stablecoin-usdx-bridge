import { createSlice, createAsyncThunk, type PayloadAction } from '@reduxjs/toolkit';
import type {
  DashboardCard,
  RecentTransaction,
  PortfolioWidget,
  QuickActionCard,
  AlertNotification,
  ChartDataPoint,
  DashboardState
} from '../../../types/dashboard/dashboard';
import {
  mockDashboardCards,
  mockRecentTransactions,
  mockPortfolio,
  mockQuickActions,
  mockAlerts,
  mockChartData
} from '../../../types/dashboard/mockDashboardData';
import { get, post, put } from '../../../api';

const initialState: DashboardState = {
  cards: [],
  recentTransactions: [],
  portfolio: null,
  quickActions: [],
  alerts: [],
  chartData: [],
  selectedPeriod: 'month',
  loading: false,
  error: null
};

// Async thunks
export const fetchDashboardData = createAsyncThunk(
  'dashboard/fetchDashboardData',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/dashboard');
      return response as {
        data: {
          cards: DashboardCard[];
          recentTransactions: RecentTransaction[];
          portfolio: PortfolioWidget;
          quickActions: QuickActionCard[];
          alerts: AlertNotification[];
          chartData: ChartDataPoint[];
        };
      };
    } catch (error: any) {
      console.warn('API failed for dashboard data, using mock data:', error);
      return {
        data: {
          cards: mockDashboardCards,
          recentTransactions: mockRecentTransactions,
          portfolio: mockPortfolio,
          quickActions: mockQuickActions,
          alerts: mockAlerts,
          chartData: mockChartData
        }
      };
    }
  }
);

export const fetchDashboardCards = createAsyncThunk(
  'dashboard/fetchCards',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/dashboard/cards');
      return response as { data: DashboardCard[] };
    } catch (error: any) {
      console.warn('API failed for dashboard cards, using mock data:', error);
      return { data: mockDashboardCards };
    }
  }
);

export const fetchRecentTransactions = createAsyncThunk(
  'dashboard/fetchRecentTransactions',
  async (limit?: number) => {
    try {
      const url = limit ? `/dashboard/transactions?limit=${limit}` : '/dashboard/transactions';
      const response = await get(url);
      return response as { data: RecentTransaction[] };
    } catch (error: any) {
      console.warn('API failed for recent transactions, using mock data:', error);
      const data = limit ? mockRecentTransactions.slice(0, limit) : mockRecentTransactions;
      return { data };
    }
  }
);

export const fetchPortfolioData = createAsyncThunk(
  'dashboard/fetchPortfolio',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/dashboard/portfolio');
      return response as { data: PortfolioWidget };
    } catch (error: any) {
      console.warn('API failed for portfolio, using mock data:', error);
      return { data: mockPortfolio };
    }
  }
);

export const fetchAlerts = createAsyncThunk(
  'dashboard/fetchAlerts',
  async (_, { rejectWithValue }) => {
    try {
      const response = await get('/dashboard/alerts');
      return response as { data: AlertNotification[] };
    } catch (error: any) {
      console.warn('API failed for alerts, using mock data:', error);
      return { data: mockAlerts };
    }
  }
);

export const fetchChartData = createAsyncThunk(
  'dashboard/fetchChartData',
  async (period: 'week' | 'month' | 'year' | 'all') => {
    try {
      const response = await get(`/dashboard/chart?period=${period}`);
      return response as { data: ChartDataPoint[] };
    } catch (error: any) {
      console.warn('API failed for chart data, using mock data:', error);
      return { data: mockChartData };
    }
  }
);

export const markAlertAsRead = createAsyncThunk(
  'dashboard/markAlertAsRead',
  async (id: string) => {
    try {
      const response = await put(`/dashboard/alerts/${id}`, { read: true });
      return response as { data: AlertNotification };
    } catch (error: any) {
      console.warn(`API failed marking alert ${id} as read, using mock:`, error);
      return { data: { id, read: true } as AlertNotification };
    }
  }
);

export const dismissAlert = createAsyncThunk(
  'dashboard/dismissAlert',
  async (id: string) => {
    try {
      await post(`/dashboard/alerts/${id}/dismiss`, {});
      return { id };
    } catch (error: any) {
      console.warn(`API failed dismissing alert ${id}, proceeding with mock:`, error);
      return { id };
    }
  }
);

const dashboardSlice = createSlice({
  name: 'dashboard',
  initialState,
  reducers: {
    setSelectedPeriod: (state, action: PayloadAction<'week' | 'month' | 'year' | 'all'>) => {
      state.selectedPeriod = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch all dashboard data
      .addCase(fetchDashboardData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.loading = false;
        state.cards = action.payload.data.cards;
        state.recentTransactions = action.payload.data.recentTransactions;
        state.portfolio = action.payload.data.portfolio;
        state.quickActions = action.payload.data.quickActions;
        state.alerts = action.payload.data.alerts;
        state.chartData = action.payload.data.chartData;
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch dashboard data';
      })

      // Fetch dashboard cards
      .addCase(fetchDashboardCards.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardCards.fulfilled, (state, action) => {
        state.loading = false;
        state.cards = action.payload.data;
      })
      .addCase(fetchDashboardCards.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch dashboard cards';
      })

      // Fetch recent transactions
      .addCase(fetchRecentTransactions.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchRecentTransactions.fulfilled, (state, action) => {
        state.loading = false;
        state.recentTransactions = action.payload.data;
      })
      .addCase(fetchRecentTransactions.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch recent transactions';
      })

      // Fetch portfolio
      .addCase(fetchPortfolioData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchPortfolioData.fulfilled, (state, action) => {
        state.loading = false;
        state.portfolio = action.payload.data;
      })
      .addCase(fetchPortfolioData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch portfolio';
      })

      // Fetch alerts
      .addCase(fetchAlerts.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchAlerts.fulfilled, (state, action) => {
        state.loading = false;
        state.alerts = action.payload.data;
      })
      .addCase(fetchAlerts.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch alerts';
      })

      // Fetch chart data
      .addCase(fetchChartData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchChartData.fulfilled, (state, action) => {
        state.loading = false;
        state.chartData = action.payload.data;
      })
      .addCase(fetchChartData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to fetch chart data';
      })

      // Mark alert as read
      .addCase(markAlertAsRead.fulfilled, (state, action) => {
        const alertIndex = state.alerts.findIndex(a => a.id === action.payload.data.id);
        if (alertIndex !== -1) {
          state.alerts[alertIndex] = action.payload.data;
        }
      })

      // Dismiss alert
      .addCase(dismissAlert.fulfilled, (state, action) => {
        state.alerts = state.alerts.filter(a => a.id !== action.payload.id);
      });
  }
});

// Selectors
export const selectDashboardCards = (state: { dashboard: DashboardState }) =>
  state.dashboard.cards;
export const selectRecentTransactions = (state: { dashboard: DashboardState }) =>
  state.dashboard.recentTransactions;
export const selectPortfolio = (state: { dashboard: DashboardState }) =>
  state.dashboard.portfolio;
export const selectQuickActions = (state: { dashboard: DashboardState }) =>
  state.dashboard.quickActions;
export const selectAlerts = (state: { dashboard: DashboardState }) => state.dashboard.alerts;
export const selectChartData = (state: { dashboard: DashboardState }) =>
  state.dashboard.chartData;
export const selectSelectedPeriod = (state: { dashboard: DashboardState }) =>
  state.dashboard.selectedPeriod;
export const selectDashboardLoading = (state: { dashboard: DashboardState }) =>
  state.dashboard.loading;
export const selectDashboardError = (state: { dashboard: DashboardState }) =>
  state.dashboard.error;

export const { setSelectedPeriod, clearError } = dashboardSlice.actions;
export default dashboardSlice.reducer;
