export interface DashboardCard {
  id: string;
  title: string;
  value: number | string;
  icon: string;
  trend?: 'up' | 'down' | 'stable';
  trendPercent?: number;
  unit?: string;
  lastUpdated: string;
}

export interface RecentTransaction {
  id: string;
  type: string;
  amount: number;
  currency: string;
  counterparty: string;
  timestamp: string;
  status: 'completed' | 'pending' | 'failed';
}

export interface PortfolioWidget {
  totalValue: number;
  gainLoss: number;
  gainLossPercent: number;
  topAsset: string;
  topAssetValue: number;
}

export interface QuickActionCard {
  id: string;
  label: string;
  icon: string;
  action: string;
  color?: string;
}

export interface AlertNotification {
  id: string;
  type: 'warning' | 'success' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  actionUrl?: string;
}

export interface ChartDataPoint {
  date: string;
  value: number;
}

export interface DashboardState {
  cards: DashboardCard[];
  recentTransactions: RecentTransaction[];
  portfolio: PortfolioWidget | null;
  quickActions: QuickActionCard[];
  alerts: AlertNotification[];
  chartData: ChartDataPoint[];
  selectedPeriod: 'week' | 'month' | 'year' | 'all';
  loading: boolean;
  error: string | null;
}
