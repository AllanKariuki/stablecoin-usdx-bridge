/**
 * DAMP Platform API Contracts
 * 
 * Type definitions for all API requests and responses.
 * These types represent the contract between frontend and backend.
 * 
 * CRITICAL: All monetary amounts are in smallest unit integers (satoshis, cents, etc.)
 */

// ============================================================================
// CORE TYPES
// ============================================================================

export type Currency = 'USD' | 'EUR' | 'KES' | 'BTC' | 'ETH' | 'USDC' | 'USDT';

export type KYCStatus = 'NONE' | 'PENDING' | 'VERIFIED' | 'REJECTED';

export type OrderSide = 'BUY' | 'SELL';

export type OrderType = 'MARKET' | 'LIMIT' | 'IOC'; // IOC = Immediate or Cancel

export type OrderStatus = 'OPEN' | 'PARTIALLY_FILLED' | 'FILLED' | 'CANCELLED' | 'REJECTED';

export type TransactionType = 
  | 'DEPOSIT' 
  | 'WITHDRAWAL' 
  | 'TRADE' 
  | 'FEE' 
  | 'TRANSFER';

export type TransactionStatus = 
  | 'PENDING' 
  | 'PROCESSING' 
  | 'COMPLETED' 
  | 'FAILED' 
  | 'CANCELLED';

export type WalletType = 'FIAT' | 'CRYPTO';

// ============================================================================
// USER & AUTHENTICATION
// ============================================================================

export interface User {
  id: string;
  email: string;
  displayName?: string;
  kycStatus: KYCStatus;
  kycSubmittedAt?: string;
  kycVerifiedAt?: string;
  twoFactorEnabled: boolean;
  emailVerified: boolean;
  phoneNumber?: string;
  phoneVerified: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
  metadata?: Record<string, any>;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  tokenType: 'Bearer';
}

export interface LoginRequest {
  email: string;
  password: string;
  twoFactorCode?: string;
}

export interface LoginResponse {
  user: User;
  tokens: AuthTokens;
  requiresTwoFactor?: boolean;
}

export interface RegisterRequest {
  email: string;
  password: string;
  displayName?: string;
  referralCode?: string;
}

export interface RegisterResponse {
  user: User;
  tokens: AuthTokens;
  message: string;
}

export interface RefreshTokenRequest {
  refreshToken: string;
}

export interface RefreshTokenResponse {
  tokens: AuthTokens;
}

// ============================================================================
// WALLETS & BALANCES
// ============================================================================

export interface Wallet {
  id: string;
  userId: string;
  currency: Currency;
  type: WalletType;
  available: number; // smallest unit integer (satoshis, cents, etc.)
  reserved: number; // smallest unit integer (locked in orders)
  address?: string; // deposit address for crypto wallets
  tag?: string; // memo/tag for currencies that require it
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

export interface WalletBalance {
  wallet: Wallet;
  total: number; // available + reserved
  usdEquivalent: number; // converted to USD cents
  percentOfPortfolio: number;
}

export interface PortfolioSummary {
  totalBalanceUSD: number; // total portfolio value in USD cents
  totalAvailableUSD: number;
  totalReservedUSD: number;
  wallets: WalletBalance[];
  dayChange: number; // percentage change in last 24h
  dayChangeUSD: number; // absolute change in USD cents
}

// ============================================================================
// TRADING
// ============================================================================

export interface TradingPair {
  symbol: string; // 'BTC-USD'
  baseCurrency: Currency; // BTC
  quoteCurrency: Currency; // USD
  baseMinSize: number; // smallest unit min order size
  baseMaxSize: number; // smallest unit max order size
  quoteIncrement: number; // price tick size in smallest unit
  baseDecimalPlaces: number; // 8 for BTC
  quoteDecimalPlaces: number; // 2 for USD
  tradingEnabled: boolean;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELISTED';
  makerFee: number; // basis points (e.g., 10 = 0.10%)
  takerFee: number; // basis points
}

export interface Order {
  id: string;
  userId: string;
  pair: string; // 'BTC-USD'
  side: OrderSide;
  type: OrderType;
  price?: number; // smallest unit price (null for market orders)
  amount: number; // smallest unit amount
  filled: number; // smallest unit filled amount
  remaining: number; // smallest unit remaining amount
  status: OrderStatus;
  fee: number; // smallest unit fee charged
  feeCurrency: Currency;
  averagePrice?: number; // average fill price in smallest unit
  createdAt: string;
  updatedAt: string;
  filledAt?: string;
  cancelledAt?: string;
  metadata?: Record<string, any>;
}

export interface CreateOrderRequest {
  pair: string;
  side: OrderSide;
  type: OrderType;
  amount: number; // smallest unit
  price?: number; // smallest unit (required for LIMIT orders)
  timeInForce?: 'GTC' | 'IOC' | 'FOK'; // Good til cancelled, immediate or cancel, fill or kill
  clientOrderId?: string; // client-provided idempotency key
}

export interface CreateOrderResponse {
  order: Order;
  message: string;
}

export interface CancelOrderRequest {
  orderId: string;
}

export interface CancelOrderResponse {
  order: Order;
  message: string;
}

export interface OrderbookLevel {
  price: number; // smallest unit
  amount: number; // smallest unit
  total: number; // cumulative amount at this level
  orders: number; // number of orders at this price
}

export interface Orderbook {
  pair: string;
  bids: OrderbookLevel[]; // sorted descending by price
  asks: OrderbookLevel[]; // sorted ascending by price
  timestamp: string;
  sequence: number; // for incremental updates
}

export interface Trade {
  id: string;
  buyOrderId: string;
  sellOrderId: string;
  pair: string;
  price: number; // smallest unit
  amount: number; // smallest unit
  fee: number; // smallest unit
  feeCurrency: Currency;
  side: OrderSide; // taker side
  timestamp: string;
  buyerUserId?: string; // only present if user was buyer
  sellerUserId?: string; // only present if user was seller
}

export interface Ticker {
  pair: string;
  lastPrice: number; // smallest unit
  bid: number; // best bid in smallest unit
  ask: number; // best ask in smallest unit
  high24h: number; // 24h high in smallest unit
  low24h: number; // 24h low in smallest unit
  volume24h: number; // 24h volume in base currency smallest unit
  volumeQuote24h: number; // 24h volume in quote currency smallest unit
  priceChange24h: number; // absolute change in smallest unit
  priceChangePercent24h: number; // percentage change
  timestamp: string;
}

export interface Candle {
  pair: string;
  timestamp: string; // opening time
  open: number; // smallest unit
  high: number; // smallest unit
  low: number; // smallest unit
  close: number; // smallest unit
  volume: number; // smallest unit volume
  trades: number; // number of trades in this candle
}

export interface Quote {
  id: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number; // smallest unit
  toAmount: number; // smallest unit
  rate: string; // decimal string for precision
  fee: number; // smallest unit
  feeCurrency: Currency;
  expiresAt: string; // ISO timestamp
  createdAt: string;
}

export interface CreateQuoteRequest {
  fromCurrency: Currency;
  toCurrency: Currency;
  fromAmount: number; // smallest unit
}

export interface ExecuteQuoteRequest {
  quoteId: string;
}

// ============================================================================
// TRANSACTIONS
// ============================================================================

export interface Transaction {
  id: string;
  userId: string;
  walletId: string;
  type: TransactionType;
  currency: Currency;
  amount: number; // smallest unit (positive for credits, negative for debits)
  fee: number; // smallest unit fee
  status: TransactionStatus;
  balanceBefore: number; // smallest unit
  balanceAfter: number; // smallest unit
  reference?: string; // blockchain tx hash, bank reference, etc.
  description?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

// ============================================================================
// DEPOSITS
// ============================================================================

export interface DepositAddress {
  walletId: string;
  currency: Currency;
  address: string;
  tag?: string; // memo/destination tag if required
  qrCode: string; // base64 encoded QR code image
  minDeposit: number; // smallest unit minimum
  confirmationsRequired: number; // for crypto
  estimatedTime?: string; // human-readable estimate
}

export interface DepositRequest {
  walletId: string;
  amount: number; // smallest unit (for fiat deposits)
  paymentMethod?: string; // for fiat: 'BANK_TRANSFER' | 'CARD' | 'MOBILE_MONEY'
  metadata?: Record<string, any>;
}

export interface DepositResponse {
  transaction: Transaction;
  paymentInstructions?: {
    bankName?: string;
    accountNumber?: string;
    reference: string;
    amount: number;
    currency: Currency;
  };
  message: string;
}

// ============================================================================
// WITHDRAWALS
// ============================================================================

export interface WithdrawalRequest {
  walletId: string;
  amount: number; // smallest unit
  destination: string; // crypto address or bank account ID
  tag?: string; // memo/destination tag if required
  twoFactorCode?: string;
  metadata?: Record<string, any>;
}

export interface WithdrawalResponse {
  transaction: Transaction;
  estimatedTime?: string;
  fee: number; // smallest unit
  message: string;
}

export interface WithdrawalLimit {
  currency: Currency;
  dailyLimit: number; // smallest unit
  dailyUsed: number; // smallest unit
  dailyRemaining: number; // smallest unit
  requiresKYC: boolean;
  requires2FA: boolean;
}

export interface WithdrawalWhitelistEntry {
  id: string;
  userId: string;
  currency: Currency;
  address: string;
  tag?: string;
  label: string;
  verified: boolean;
  createdAt: string;
}

// ============================================================================
// KYC
// ============================================================================

export interface KYCDocument {
  id: string;
  userId: string;
  type: 'ID_CARD' | 'PASSPORT' | 'DRIVERS_LICENSE' | 'PROOF_OF_ADDRESS';
  documentNumber?: string;
  country: string;
  expiryDate?: string;
  uploadedAt: string;
  verifiedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
}

export interface KYCSubmission {
  userId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  address: {
    street: string;
    city: string;
    state?: string;
    postalCode: string;
    country: string;
  };
  documents: Array<{
    type: KYCDocument['type'];
    fileUrl: string;
    documentNumber?: string;
    expiryDate?: string;
  }>;
  selfieUrl?: string;
}

export interface KYCStatus {
  status: KYCStatus;
  submittedAt?: string;
  verifiedAt?: string;
  rejectedAt?: string;
  rejectionReason?: string;
  documents: KYCDocument[];
  nextSteps?: string[];
}

// ============================================================================
// NOTIFICATIONS
// ============================================================================

export interface Notification {
  id: string;
  userId: string;
  type: 
    | 'ORDER_FILLED'
    | 'ORDER_PARTIALLY_FILLED'
    | 'ORDER_CANCELLED'
    | 'DEPOSIT_COMPLETED'
    | 'WITHDRAWAL_COMPLETED'
    | 'KYC_VERIFIED'
    | 'KYC_REJECTED'
    | 'SECURITY_ALERT'
    | 'SYSTEM_MAINTENANCE';
  title: string;
  message: string;
  read: boolean;
  actionUrl?: string;
  actionLabel?: string;
  metadata?: Record<string, any>;
  createdAt: string;
  readAt?: string;
}

export interface NotificationPreferences {
  userId: string;
  email: {
    orderFills: boolean;
    deposits: boolean;
    withdrawals: boolean;
    kycUpdates: boolean;
    securityAlerts: boolean;
    marketing: boolean;
  };
  push: {
    orderFills: boolean;
    deposits: boolean;
    withdrawals: boolean;
    securityAlerts: boolean;
  };
  inApp: {
    all: boolean;
  };
}

// ============================================================================
// SETTINGS & SECURITY
// ============================================================================

export interface TwoFactorSetup {
  secret: string;
  qrCode: string; // base64 encoded QR code
  backupCodes: string[];
}

export interface EnableTwoFactorRequest {
  code: string; // verification code from authenticator app
}

export interface DisableTwoFactorRequest {
  code: string;
  password: string;
}

export interface APIKey {
  id: string;
  userId: string;
  name: string;
  key: string; // only shown once on creation
  permissions: Array<'READ' | 'TRADE' | 'WITHDRAW'>;
  ipWhitelist?: string[]; // array of allowed IP addresses
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  revoked: boolean;
}

export interface CreateAPIKeyRequest {
  name: string;
  permissions: APIKey['permissions'];
  ipWhitelist?: string[];
  expiresAt?: string;
}

export interface SessionInfo {
  id: string;
  userId: string;
  ipAddress: string;
  userAgent: string;
  location?: string;
  current: boolean;
  createdAt: string;
  lastActivityAt: string;
}

// ============================================================================
// WEBSOCKET MESSAGES
// ============================================================================

export interface WebSocketMessage<T = any> {
  type: string;
  channel: string;
  data: T;
  timestamp: string;
  sequence?: number;
}

export interface WebSocketSubscribe {
  type: 'subscribe';
  channels: string[]; // e.g., ['orderbook:BTC-USD', 'trades:BTC-USD', 'balances']
}

export interface WebSocketUnsubscribe {
  type: 'unsubscribe';
  channels: string[];
}

export interface OrderbookUpdate {
  pair: string;
  changes: Array<{
    side: 'bid' | 'ask';
    price: number; // smallest unit
    amount: number; // smallest unit (0 means remove this level)
  }>;
  sequence: number;
  timestamp: string;
}

export interface BalanceUpdate {
  walletId: string;
  currency: Currency;
  available: number; // new available balance in smallest unit
  reserved: number; // new reserved balance in smallest unit
  change: number; // change amount in smallest unit
  reason: 'ORDER' | 'TRADE' | 'DEPOSIT' | 'WITHDRAWAL' | 'FEE';
  timestamp: string;
}

// ============================================================================
// ERROR RESPONSES
// ============================================================================

export interface APIError {
  code: string; // e.g., 'INSUFFICIENT_BALANCE', 'INVALID_ORDER'
  message: string; // user-friendly message
  details?: Record<string, any>; // additional error context
  timestamp: string;
}

export interface ValidationError extends APIError {
  code: 'VALIDATION_ERROR';
  fields: Record<string, string[]>; // field name -> array of error messages
}

// ============================================================================
// PAGINATION
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ============================================================================
// TYPE GUARDS
// ============================================================================

export function isAPIError(error: any): error is APIError {
  return error && typeof error.code === 'string' && typeof error.message === 'string';
}

export function isValidationError(error: any): error is ValidationError {
  return isAPIError(error) && error.code === 'VALIDATION_ERROR' && 'fields' in error;
}
