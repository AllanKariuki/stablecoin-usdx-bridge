import type {
  DashboardCard,
  RecentTransaction,
  PortfolioWidget,
  QuickActionCard,
  AlertNotification,
  ChartDataPoint
} from './dashboard';

export const mockDashboardCards: DashboardCard[] = [
  {
    id: '1',
    title: 'Total Balance',
    value: 25450.75,
    icon: 'Wallet',
    trend: 'up',
    trendPercent: 5.2,
    unit: 'USD',
    lastUpdated: '2025-11-20T10:30:00Z'
  },
  {
    id: '2',
    title: 'This Month Spent',
    value: 3250.00,
    icon: 'TrendingDown',
    trend: 'up',
    trendPercent: 2.1,
    unit: 'USD',
    lastUpdated: '2025-11-20T10:30:00Z'
  },
  {
    id: '3',
    title: 'Portfolio Value',
    value: 45000.00,
    icon: 'TrendingUp',
    trend: 'up',
    trendPercent: 8.5,
    unit: 'USD',
    lastUpdated: '2025-11-20T10:30:00Z'
  },
  {
    id: '4',
    title: 'Savings Progress',
    value: 18500.00,
    icon: 'Target',
    trend: 'up',
    trendPercent: 12.3,
    unit: 'USD',
    lastUpdated: '2025-11-20T10:30:00Z'
  }
];

export const mockRecentTransactions: RecentTransaction[] = [
  {
    id: '1',
    type: 'Payment Sent',
    amount: 500,
    currency: 'USD',
    counterparty: 'John Smith',
    timestamp: '2025-11-20T14:30:00Z',
    status: 'completed'
  },
  {
    id: '2',
    type: 'Payment Received',
    amount: 1200,
    currency: 'USD',
    counterparty: 'Jane Doe',
    timestamp: '2025-11-20T12:15:00Z',
    status: 'completed'
  },
  {
    id: '3',
    type: 'Bill Payment',
    amount: 150.50,
    currency: 'USD',
    counterparty: 'City Power Company',
    timestamp: '2025-11-19T10:00:00Z',
    status: 'completed'
  },
  {
    id: '4',
    type: 'Investment Buy',
    amount: 1000,
    currency: 'USD',
    counterparty: 'Stock Market',
    timestamp: '2025-11-18T15:45:00Z',
    status: 'completed'
  },
  {
    id: '5',
    type: 'Transfer',
    amount: 500,
    currency: 'USD',
    counterparty: 'Savings Account',
    timestamp: '2025-11-17T11:20:00Z',
    status: 'pending'
  }
];

export const mockPortfolio: PortfolioWidget = {
  totalValue: 45000,
  gainLoss: 3500,
  gainLossPercent: 8.5,
  topAsset: 'Apple Inc. (AAPL)',
  topAssetValue: 12500
};

export const mockQuickActions: QuickActionCard[] = [
  {
    id: '1',
    label: 'Send Money',
    icon: 'Send',
    action: '/payments/send',
    color: 'blue'
  },
  {
    id: '2',
    label: 'Pay Bills',
    icon: 'FileText',
    action: '/payments/bills',
    color: 'orange'
  },
  {
    id: '3',
    label: 'Request Payment',
    icon: 'ArrowDownLeft',
    action: '/payments/request',
    color: 'green'
  },
  {
    id: '4',
    label: 'Investments',
    icon: 'TrendingUp',
    action: '/investments/portfolio',
    color: 'purple'
  },
  {
    id: '5',
    label: 'View Wallet',
    icon: 'Wallet',
    action: '/wallet/overview',
    color: 'cyan'
  },
  {
    id: '6',
    label: 'Get Loan',
    icon: 'DollarSign',
    action: '/loans/apply',
    color: 'red'
  }
];

export const mockAlerts: AlertNotification[] = [
  {
    id: '1',
    type: 'success',
    title: 'Payment Successful',
    message: 'Your payment of $500 to John Smith has been processed successfully.',
    timestamp: '2025-11-20T14:30:00Z',
    read: false,
    actionUrl: '/payments/history'
  },
  {
    id: '2',
    type: 'warning',
    title: 'Upcoming Bill Due',
    message: 'Your electricity bill of $150.50 is due on November 25th.',
    timestamp: '2025-11-20T10:00:00Z',
    read: false,
    actionUrl: '/payments/bills'
  },
  {
    id: '3',
    type: 'info',
    title: 'Portfolio Update',
    message: 'Your portfolio has increased by 8.5% this month.',
    timestamp: '2025-11-20T09:00:00Z',
    read: true,
    actionUrl: '/investments/portfolio'
  }
];

export const mockChartData: ChartDataPoint[] = [
  { date: '2025-11-14', value: 23500 },
  { date: '2025-11-15', value: 24100 },
  { date: '2025-11-16', value: 24800 },
  { date: '2025-11-17', value: 24200 },
  { date: '2025-11-18', value: 25100 },
  { date: '2025-11-19', value: 25300 },
  { date: '2025-11-20', value: 25450.75 }
];
