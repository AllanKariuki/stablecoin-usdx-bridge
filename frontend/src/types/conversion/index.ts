/**
 * Extended Currency Conversion Types
 * Supports fiat, crypto, and stablecoin conversions
 */

// Asset type classification
export type AssetType = 'fiat' | 'crypto' | 'stablecoin';

export interface Currency {
  code: string;
  name: string;
  symbol: string;
  flagEmoji?: string;
  type: AssetType; // NEW: classify the asset
  decimals?: number; // For crypto (e.g., BTC has 8, ETH has 18)
  network?: string; // For crypto/stablecoin (e.g., 'ethereum', 'solana')
  contractAddress?: string; // For stablecoins and ERC-20 tokens
  isNative?: boolean; // For native tokens like ETH, SOL
}

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  timestamp: string;
  source: 'live' | 'cached';
  venue?: string; // NEW: which exchange/LP provided this rate
  midPrice?: number; // NEW: market mid-price for reference
  bid?: number; // NEW: best bid price
  ask?: number; // NEW: best ask price
}

export interface ConversionQuote {
  quoteId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  exchangeRate: number;
  fees: FeeBreakdown;
  totalFees: number;
  netAmount: number;
  expiresAt: string; // ISO timestamp
  createdAt: string; // ISO timestamp
  
  // NEW: Enhanced fields for crypto conversions
  conversionType: 'fiat_to_fiat' | 'fiat_to_crypto' | 'fiat_to_stablecoin' | 
                  'crypto_to_fiat' | 'crypto_to_crypto' | 'stablecoin_to_fiat' |
                  'stablecoin_to_crypto' | 'crypto_to_stablecoin';
  executionVenue?: string; // e.g., 'Coinbase', 'Internal Pool', 'OTC Desk'
  slippageTolerance?: number; // percentage, e.g., 0.5 for 0.5%
  priceImpact?: number; // estimated price impact for large orders
  gasEstimate?: GasEstimate; // for on-chain transfers
  settlementTime?: string; // estimated completion time
  taxImplication?: TaxImplication; // NEW: for capital gains tracking
}

export interface GasEstimate {
  network: string;
  gasLimit: number;
  gasPrice: string; // in gwei or native unit
  estimatedCost: number; // in fiat equivalent
  estimatedCostCrypto: number; // in native token (e.g., ETH)
}

export interface TaxImplication {
  acquisitionCostBasis?: number; // original purchase price
  fmvAtConversion: number; // fair market value at conversion time
  capitalGain?: number; // gain/loss amount
  holdingPeriod?: number; // days held
  taxCategory?: 'short_term' | 'long_term' | 'exempt';
}

export interface FeeBreakdown {
  processingFee: number; // percentage or flat
  conversionFee: number; // percentage
  networkFee?: number; // NEW: blockchain gas fees
  liquidityProviderFee?: number; // NEW: LP spread/fee
  bankFee?: number; // for fiat rails
  total: number;
}

export interface PaymentMethod {
  id: string;
  type: 'bank_account' | 'card' | 'wallet' | 'mobile_money' | 'crypto_wallet'; // NEW: crypto_wallet
  name: string;
  lastFour?: string;
  address?: string; // NEW: for crypto wallets
  network?: string; // NEW: blockchain network
  provider?: string;
  isDefault: boolean;
  balance?: number; // NEW: available balance
  currency?: string; // NEW: what currency/token this holds
}

export interface ConversionConfirmation {
  transactionId: string;
  quoteId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  fees: FeeBreakdown;
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  createdAt: string;
  completedAt?: string;
  
  // NEW: Blockchain-specific fields
  txHash?: string; // blockchain transaction hash
  blockNumber?: number; // block number (once confirmed)
  confirmations?: number; // number of confirmations
  explorerUrl?: string; // link to block explorer
  ledgerTxId?: string; // internal ledger transaction ID
  acquisitionCostBasis?: number; // for tax reporting
}

export type TransactionStatus =
  | 'pending'
  | 'processing'
  | 'broadcasting' // NEW: transaction sent to blockchain
  | 'confirming' // NEW: waiting for confirmations
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'; // NEW: quote expired before execution

export interface TransactionHistory {
  transactionId: string;
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  status: TransactionStatus;
  createdAt: string;
  completedAt?: string;
  direction: 'sent' | 'received';
  
  // NEW: Enhanced tracking
  conversionType: ConversionQuote['conversionType'];
  txHash?: string;
  networkFee?: number;
  executionVenue?: string;
  exchangeRate?: number;
}

export interface Wallet {
  id: string;
  currency: string;
  type: AssetType; // NEW: fiat, crypto, or stablecoin
  balance: number;
  available: number; // available after pending transactions
  pending?: number; // NEW: pending deposits/withdrawals
  lastUpdated: string;
  
  // NEW: Crypto-specific fields
  address?: string; // wallet address
  network?: string; // blockchain network
  tier?: 'hot' | 'warm' | 'cold'; // wallet tier from DAMP spec
  minimumBalance?: number; // minimum required balance
  isLocked?: boolean; // if wallet is frozen/locked
}

export interface KYCData {
  status: 'pending' | 'approved' | 'rejected';
  level: 1 | 2 | 3;
  verificationDate?: string;
  nextReviewDate?: string;
  documents: KYCDocument[];
  
  // NEW: Transaction limits based on KYC level
  limits: {
    dailyLimit: number;
    monthlyLimit: number;
    singleTransactionLimit: number;
    remainingDaily?: number;
    remainingMonthly?: number;
  };
}

export interface KYCDocument {
  id: string;
  type: 'passport' | 'id_card' | 'drivers_license' | 'address_proof';
  status: 'pending' | 'verified' | 'rejected';
  uploadDate: string;
  expiryDate?: string;
  rejectionReason?: string;
}

export interface ConversionError {
  code: string;
  message: string;
  field?: string;
  details?: Record<string, unknown>;
  
  // NEW: More specific error context
  retryable?: boolean; // if user can retry
  suggestedAction?: string; // what user should do
}

/**
 * API Request/Response types
 */
export interface QuoteRequest {
  fromCurrency: string;
  toCurrency: string;
  amount: number;
  paymentMethod?: string;
  
  // NEW: Additional parameters
  slippageTolerance?: number; // max acceptable slippage (e.g., 0.5 for 0.5%)
  destinationAddress?: string; // for crypto withdrawals
  destinationNetwork?: string; // target blockchain network
  urgency?: 'standard' | 'fast' | 'instant'; // affects fees and speed
}

export interface QuoteResponse {
  success: boolean;
  data?: ConversionQuote;
  error?: ConversionError;
  
  // NEW: Additional metadata
  alternativeRoutes?: ConversionQuote[]; // other execution paths
  marketConditions?: {
    volatility: 'low' | 'medium' | 'high';
    liquidity: 'low' | 'medium' | 'high';
    recommendation?: string;
  };
}

export interface ConversionRequest {
  quoteId: string;
  paymentMethodId: string;
  idempotencyKey: string; // UUID for idempotency
  
  // NEW: Confirmation parameters
  acceptedSlippage?: number; // user's max acceptable slippage
  destinationAddress?: string; // where to send crypto
  destinationNetwork?: string; // which blockchain
  twoFactorCode?: string; // 2FA for high-value transactions
}

export interface ConversionResponse {
  success: boolean;
  data?: ConversionConfirmation;
  error?: ConversionError;
  
  // NEW: Next steps guidance
  nextSteps?: string[]; // what happens next
  estimatedCompletion?: string; // when to expect completion
}

export interface TransactionStatusUpdate {
  transactionId: string;
  status: TransactionStatus;
  updatedAt: string;
  message?: string;
  
  // NEW: Progress tracking
  confirmations?: number;
  requiredConfirmations?: number;
  estimatedTimeRemaining?: number; // seconds
  blockExplorerUrl?: string;
}

/**
 * NEW: Multi-chain stablecoin support (USD-X)
 */
export interface StablecoinBalance {
  total: number; // total across all chains
  byChain: {
    [network: string]: {
      balance: number;
      address: string;
      contractAddress: string;
    };
  };
}

export interface MintBurnRequest {
  action: 'mint' | 'burn';
  amount: number;
  targetChain: 'ethereum' | 'solana' | 'ethereum-l2';
  sourceAccount: string; // fiat account ID
  destinationAddress?: string; // for mints
}

export interface ReserveStatus {
  totalSupply: number; // total USD-X in circulation
  totalReserves: number; // total fiat backing
  reserveRatio: number; // should always be >= 1.0
  lastReconciliation: string;
  proofOfReserves?: string; // URL to latest PoR report
  composition: {
    cash: number;
    cashEquivalents: number;
    treasuryBills: number;
  };
}

/**
 * NEW: Liquidity and order book data
 */
export interface OrderBookDepth {
  bids: [number, number][]; // [price, amount][]
  asks: [number, number][];
  spread: number;
  midPrice: number;
  venue: string;
  timestamp: string;
}

export interface LiquiditySource {
  venue: string;
  type: 'exchange' | 'otc' | 'internal' | 'dex';
  available: boolean;
  latency: number; // ms
  feeTier: number; // percentage
  minAmount?: number;
  maxAmount?: number;
}

/**
 * Conversion state interface
 */
export interface ConversionState {
  // Currencies & Wallets
  currencies: Currency[];
  wallets: Wallet[];
  kycStatus: KYCData | null;
  transactionHistory: TransactionHistory[];

  // Current conversion flow
  currentQuote: ConversionQuote | null;
  currentTransaction: ConversionConfirmation | null;
  transactionStatus: TransactionStatus | null;

  // NEW: Crypto/Stablecoin specific
  reserveStatus: ReserveStatus | null; // USD-X reserve transparency
  liquiditySources: LiquiditySource[]; // available liquidity providers
  orderBookDepth: OrderBookDepth | null; // current order book
  stablecoinBalance: StablecoinBalance | null; // USD-X multi-chain balance

  // Loading states
  loading: {
    currencies: boolean;
    wallets: boolean;
    kycStatus: boolean;
    quote: boolean;
    confirmation: boolean;
    transactionStatus: boolean;
    history: boolean;
    reserveStatus: boolean;
    liquiditySources: boolean;
    orderBookDepth: boolean;
    stablecoinBalance: boolean;
  };

  // Errors
  errors: {
    currencies: string | null;
    wallets: string | null;
    kycStatus: string | null;
    quote: string | null;
    confirmation: string | null;
    transactionStatus: string | null;
    history: string | null;
    reserveStatus: string | null;
    liquiditySources: string | null;
    orderBookDepth: string | null;
    stablecoinBalance: string | null;
  };

  quoteCache: Record<string, {
    quote: ConversionQuote;
    cachedAt: number;
  }>;
}