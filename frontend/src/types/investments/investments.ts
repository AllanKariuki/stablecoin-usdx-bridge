export interface Stock {
  id: string;
  symbol: string;
  name: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  totalValue: number;
  gainLoss: number;
  gainLossPercent: number;
  purchaseDate: string;
}

export interface Bond {
  id: string;
  name: string;
  issuer: string;
  quantity: number;
  purchasePrice: number;
  currentPrice: number;
  maturityDate: string;
  couponRate: number;
  totalValue: number;
  gainLoss: number;
  gainLossPercent: number;
}

export interface MutualFund {
  id: string;
  name: string;
  fundManager: string;
  units: number;
  unitPrice: number;
  totalValue: number;
  gainLoss: number;
  gainLossPercent: number;
  navDate: string;
  expenseRatio: number;
}

export interface CryptoAsset {
  id: string;
  symbol: string;
  name: string;
  amount: number;
  purchasePrice: number;
  currentPrice: number;
  totalValue: number;
  gainLoss: number;
  gainLossPercent: number;
  purchaseDate: string;
}

export interface InvestmentPortfolio {
  id: string;
  totalValue: number;
  totalInvested: number;
  totalGainLoss: number;
  gainLossPercent: number;
  lastUpdated: string;
}

export interface InvestmentPerformance {
  id: string;
  period: string;
  totalReturn: number;
  annualReturn: number;
  volatility: number;
  sharpRatio: number;
  maxDrawdown: number;
  winningDays: number;
  losingDays: number;
}

export interface InvestmentsState {
  stocks: Stock[];
  bonds: Bond[];
  mutualFunds: MutualFund[];
  cryptoAssets: CryptoAsset[];
  portfolio: InvestmentPortfolio | null;
  performances: InvestmentPerformance[];
  selectedStock: Stock | null;
  selectedBond: Bond | null;
  selectedFund: MutualFund | null;
  selectedCrypto: CryptoAsset | null;
  loading: boolean;
  error: string | null;
}
