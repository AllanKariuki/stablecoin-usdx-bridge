/**
 * Wallet & Cryptocurrency Types
 * Comprehensive types for digital wallet management
 */

// ============================================================================
// WALLET TYPES
// ============================================================================

export type WalletType = 'fiat' | 'crypto';
export type WalletStatus = 'active' | 'suspended' | 'closed';
export type CryptoCurrency = 'BTC' | 'ETH' | 'USDT' | 'USDC' | 'XRP' | 'SOL' | 'ADA' | 'DOT';
export type FiatCurrency = 'USD' | 'EUR' | 'GBP' | 'KES' | 'NGN' | 'ZAR' | 'INR' | 'CAD' | 'AUD' | 'JPY' | 'CHF' | 'CNY';

export interface Wallet {
  id: string;
  userId: string;
  type: WalletType;
  currency: FiatCurrency | CryptoCurrency;
  balance: number;
  availableBalance: number;
  lockedBalance: number;
  walletAddress?: string; // for crypto wallets
  network?: string; // for crypto (e.g., Ethereum, BSC, Polygon)
  isDefault: boolean;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface WalletTransaction {
  id: string;
  walletId: string;
  type: 'credit' | 'debit';
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'cancelled';
  description: string;
  reference: string;
  balanceAfter: number;
  metadata?: Record<string, any>;
  createdAt: string;
}

// ============================================================================
// DEPOSIT TYPES
// ============================================================================

export type DepositMethod = 'bank_transfer' | 'card' | 'mobile_money' | 'crypto' | 'cash';
export type DepositStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Deposit {
  id: string;
  userId: string;
  walletId: string;
  amount: number;
  currency: string;
  method: DepositMethod;
  status: DepositStatus;
  reference: string;
  sourceAccount?: string;
  sourceBank?: string;
  transactionHash?: string; // for crypto deposits
  fees: number;
  netAmount: number;
  notes?: string;
  proofOfPayment?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// WITHDRAWAL TYPES
// ============================================================================

export type WithdrawalMethod = 'bank_transfer' | 'mobile_money' | 'crypto' | 'cash_pickup';
export type WithdrawalStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

export interface Withdrawal {
  id: string;
  userId: string;
  walletId: string;
  amount: number;
  currency: string;
  method: WithdrawalMethod;
  status: WithdrawalStatus;
  reference: string;
  destinationAccount: string;
  destinationBank?: string;
  destinationWalletAddress?: string;
  destinationNetwork?: string;
  accountHolderName: string;
  transactionHash?: string;
  fees: number;
  netAmount: number;
  notes?: string;
  processedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BANK ACCOUNT TYPES
// ============================================================================

export type AccountType = 'savings' | 'checking' | 'current';

export interface BankAccount {
  id: string;
  userId: string;
  bankName: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  accountType: AccountType;
  currency: string;
  isVerified: boolean;
  isPrimary: boolean;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface LinkedAccount {
  id: string;
  userId: string;
  type: 'bank' | 'mobile_money' | 'card' | 'wallet';
  institutionName: string;
  accountIdentifier: string;
  accountName: string;
  isVerified: boolean;
  isPrimary: boolean;
  canReceive: boolean;
  canSend: boolean;
  lastUsed?: string;
  createdAt: string;
}

export interface MobileMoneyAccount {
  id: string;
  userId: string;
  provider: string; // MTN, Airtel, Vodafone, etc.
  phoneNumber: string;
  accountName: string;
  isVerified: boolean;
  isPrimary: boolean;
  status: WalletStatus;
  createdAt: string;
}

// ============================================================================
// CRYPTOCURRENCY TYPES
// ============================================================================

export interface CryptoWallet {
  id: string;
  userId: string;
  cryptocurrency: CryptoCurrency;
  network: string;
  publicAddress: string;
  privateKeyEncrypted?: string; // should be encrypted server-side
  balance: number; // in smallest unit (satoshi, wei, etc.)
  balanceUSD: number;
  isImported: boolean;
  status: WalletStatus;
  createdAt: string;
  updatedAt: string;
}

export interface CryptoTransaction {
  id: string;
  walletId: string;
  type: 'send' | 'receive';
  fromAddress: string;
  toAddress: string;
  amount: number;
  amountUSD: number;
  currency: CryptoCurrency;
  network: string;
  gasPrice?: number;
  gasCost?: number;
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
  confirmations: number;
  createdAt: string;
  completedAt?: string;
}

export interface CryptoPrice {
  symbol: CryptoCurrency;
  currentPrice: number;
  priceChangePercent24h: number;
  marketCap: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  circulatingSupply: number;
  totalSupply: number;
  lastUpdated: string;
}

// ============================================================================
// STAKING & YIELD TYPES
// ============================================================================

export interface StakingPosition {
  id: string;
  userId: string;
  walletId: string;
  cryptocurrency: CryptoCurrency;
  amount: number;
  annualYield: number; // percentage
  totalEarned: number;
  startDate: string;
  unlockDate?: string;
  lockingPeriod: number; // in days
  status: 'active' | 'unlocking' | 'unlocked';
  createdAt: string;
}

export interface YieldReward {
  id: string;
  stakingPositionId: string;
  amount: number;
  currency: CryptoCurrency;
  earnedDate: string;
  claimedDate?: string;
  status: 'earned' | 'claimed' | 'pending';
}
