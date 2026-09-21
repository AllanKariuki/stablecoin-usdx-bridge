/**
 * Trading, Conversion & Investment Types
 * Types for crypto trading, forex, currency conversions, and investment operations
 */

// ============================================================================
// ORDER TYPES
// ============================================================================

export type OrderType = 'market' | 'limit' | 'stop_loss' | 'trailing_stop';
export type OrderSide = 'buy' | 'sell';
export type OrderStatus = 'pending' | 'open' | 'partial' | 'completed' | 'cancelled' | 'expired' | 'rejected';
export type TimeInForce = 'GTC' | 'IOC' | 'FOK'; // Good-Till-Cancel, Immediate-Or-Cancel, Fill-Or-Kill

export interface Order {
  id: string;
  userId: string;
  type: OrderType;
  side: OrderSide;
  pair: string; // e.g., "BTC/USD", "ETH/USDT"
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  price?: number;
  stopPrice?: number;
  filled: number;
  filledPercent: number;
  status: OrderStatus;
  fees: number;
  total: number;
  timeInForce?: TimeInForce;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Trade {
  id: string;
  orderId: string;
  userId: string;
  type: OrderSide;
  pair: string;
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  price: number;
  fees: number;
  total: number;
  executedAt: string;
}

export interface TradingPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  currentPrice: number;
  priceChangePercent24h: number;
  high24h: number;
  low24h: number;
  volume24h: number;
  bidPrice: number;
  askPrice: number;
  lastTrade: {
    price: number;
    quantity: number;
    time: string;
  };
}

// ============================================================================
// CONVERSION TYPES
// ============================================================================

export interface Conversion {
  id: string;
  userId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  fees: number;
  status: 'pending' | 'completed' | 'failed';
  reference: string;
  createdAt: string;
  completedAt?: string;
}

export interface ExchangeRate {
  fromCurrency: string;
  toCurrency: string;
  rate: number;
  bidRate?: number;
  askRate?: number;
  timestamp: string;
}

// ============================================================================
// PORTFOLIO TYPES
// ============================================================================

export type AssetType = 'stock' | 'bond' | 'mutual_fund' | 'etf' | 'crypto' | 'commodity' | 'forex';

export interface Portfolio {
  id: string;
  userId: string;
  name: string;
  totalValue: number;
  currency: string;
  totalInvested: number;
  totalReturn: number;
  returnPercentage: number;
  assets: PortfolioAsset[];
  allocation: AssetAllocation[];
  lastUpdated: string;
  createdAt: string;
}

export interface PortfolioAsset {
  id: string;
  type: AssetType;
  symbol: string;
  name: string;
  quantity: number;
  averagePrice: number;
  currentPrice: number;
  totalValue: number;
  totalCost: number;
  profit: number;
  profitPercentage: number;
  allocation: number;
}

export interface AssetAllocation {
  type: AssetType;
  value: number;
  percentage: number;
}

export interface Investment {
  id: string;
  userId: string;
  portfolioId: string;
  type: AssetType;
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  purchaseDate: string;
  currentPrice: number;
  currentValue: number;
  profit: number;
  profitPercentage: number;
  status: 'active' | 'sold' | 'pending';
}

export interface InvestmentTransaction {
  id: string;
  userId: string;
  portfolioId: string;
  type: 'buy' | 'sell' | 'dividend' | 'interest' | 'split';
  assetType: AssetType;
  symbol: string;
  quantity: number;
  price: number;
  totalAmount: number;
  fees: number;
  netAmount: number;
  date: string;
  createdAt: string;
}

// ============================================================================
// STOCKS & EQUITY TYPES
// ============================================================================

export interface Stock {
  symbol: string;
  companyName: string;
  currentPrice: number;
  priceChange: number;
  priceChangePercent: number;
  marketCap: number;
  peRatio?: number;
  dividendYield?: number;
  high52Week: number;
  low52Week: number;
  volume: number;
  description?: string;
  sector?: string;
  industry?: string;
  lastUpdated: string;
}

export interface StockPrice {
  symbol: string;
  price: number;
  timestamp: string;
  change: number;
  changePercent: number;
}

// ============================================================================
// FOREX TYPES
// ============================================================================

export interface ForexPair {
  pair: string;
  baseSymbol: string;
  quoteSymbol: string;
  currentRate: number;
  rateChange: number;
  rateChangePercent: number;
  bidRate: number;
  askRate: number;
  spread: number;
  high: number;
  low: number;
  volume: number;
  lastUpdated: string;
}

// ============================================================================
// WATCHLIST TYPES
// ============================================================================

export interface WatchlistItem {
  id: string;
  userId: string;
  assetType: AssetType;
  symbol: string;
  name: string;
  currentPrice: number;
  addedAt: string;
}

export interface Watchlist {
  id: string;
  userId: string;
  name: string;
  description?: string;
  items: WatchlistItem[];
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PRICE ALERT TYPES
// ============================================================================

export interface PriceAlert {
  id: string;
  userId: string;
  assetType: AssetType;
  symbol: string;
  targetPrice: number;
  condition: 'above' | 'below'; // trigger when price goes above or below target
  status: 'active' | 'triggered' | 'cancelled';
  notificationMethods: ('email' | 'sms' | 'push' | 'in_app')[];
  triggeredAt?: string;
  createdAt: string;
}

// ============================================================================
// DIVIDEND & INTEREST TYPES
// ============================================================================

export interface Dividend {
  id: string;
  investmentId: string;
  userId: string;
  symbol: string;
  amount: number;
  currency: string;
  payoutDate: string;
  recordDate: string;
  exDividendDate: string;
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  yieldPercentage: number;
}

export interface Interest {
  id: string;
  investmentId: string;
  userId: string;
  symbol: string;
  amount: number;
  currency: string;
  paidDate: string;
  accrualPeriodStart: string;
  accrualPeriodEnd: string;
  rate: number;
}

// ============================================================================
// MARKET DATA TYPES
// ============================================================================

export interface OHLCV {
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface PriceChart {
  symbol: string;
  data: OHLCV[];
  period: '1m' | '5m' | '15m' | '1h' | '4h' | '1d' | '1w' | '1M';
}

export interface MarketTicker {
  symbol: string;
  currentPrice: number;
  priceChangePercent24h: number;
  volume24h: number;
  marketCap?: number;
  timestamp: string;
}

// ============================================================================
// TRADE ANALYSIS TYPES
// ============================================================================

export interface TradeAnalysis {
  userId: string;
  totalTrades: number;
  winRate: number; // percentage
  averageWin: number;
  averageLoss: number;
  totalProfit: number;
  totalLoss: number;
  profitFactor: number;
  sharpeRatio?: number;
  maxDrawdown?: number;
  period: {
    startDate: string;
    endDate: string;
  };
}

export interface TradingPerformance {
  userId: string;
  date: string;
  totalValue: number;
  dailyReturn: number;
  dailyReturnPercent: number;
  weeklyReturn: number;
  monthlyReturn: number;
  yearlyReturn: number;
}
