/**
 * Conversion Test Fixtures
 * Sample data for testing and development
 */

import type {
  ConversionQuote,
  Currency,
  PaymentMethod,
  ConversionConfirmation,
  TransactionHistory,
  Wallet,
  KYCData,
} from '../types/conversion';

/**
 * Sample currencies
 */
export const mockCurrencies: Currency[] = [
  {
    code: 'USD',
    name: 'US Dollar',
    symbol: '$',
    flagEmoji: '🇺🇸',
    type: 'fiat',
  },
  {
    code: 'EUR',
    name: 'Euro',
    symbol: '€',
    flagEmoji: '🇪🇺',
    type: 'fiat',
  },
  {
    code: 'GBP',
    name: 'British Pound',
    symbol: '£',
    flagEmoji: '🇬🇧',
    type: 'fiat',
  },
  {
    code: 'JPY',
    name: 'Japanese Yen',
    symbol: '¥',
    flagEmoji: '🇯🇵',
    type: 'fiat',
  },
  {
    code: 'AUD',
    name: 'Australian Dollar',
    symbol: 'A$',
    flagEmoji: '🇦🇺',
    type: 'fiat',
  },
  {
    code: 'CAD',
    name: 'Canadian Dollar',
    symbol: 'C$',
    flagEmoji: '🇨🇦',
    type: 'fiat',
  },
  {
    code: 'CHF',
    name: 'Swiss Franc',
    symbol: 'CHF',
    flagEmoji: '🇨🇭',
    type: 'fiat',
  },
  {
    code: 'CNY',
    name: 'Chinese Yuan',
    symbol: '¥',
    flagEmoji: '🇨🇳',
    type: 'fiat',
  },
  {
    code: 'INR',
    name: 'Indian Rupee',
    symbol: '₹',
    flagEmoji: '🇮🇳',
    type: 'fiat',
  },
];

/**
 * Sample quote
 */
export const mockQuote: ConversionQuote = {
  quoteId: 'QT-1699564800000-abc123def456',
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  fromAmount: 1000,
  toAmount: 920,
  exchangeRate: 0.92,
  fees: {
    processingFee: 1.5,
    conversionFee: 0.5,
    bankFee: 2.5,
    total: 2.0,
  },
  totalFees: 17.5,
  netAmount: 902.5,
  expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  createdAt: new Date().toISOString(),
  conversionType: 'fiat_to_fiat',
};

/**
 * Sample wallets
 */
export const mockWallets: Wallet[] = [
  {
    id: 'wallet-usd-001',
    currency: 'USD',
    type: 'fiat',
    balance: 5000,
    available: 4500,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'wallet-eur-001',
    currency: 'EUR',
    type: 'fiat',
    balance: 2000,
    available: 1800,
    lastUpdated: new Date().toISOString(),
  },
  {
    id: 'wallet-gbp-001',
    currency: 'GBP',
    type: 'fiat',
    balance: 1500,
    available: 1400,
    lastUpdated: new Date().toISOString(),
  },
];

/**
 * Sample payment methods
 */
export const mockPaymentMethods: PaymentMethod[] = [
  {
    id: 'pm-bank-001',
    type: 'bank_account',
    name: 'Main Checking Account',
    lastFour: '4242',
    provider: 'Chase Bank',
    isDefault: true,
  },
  {
    id: 'pm-card-001',
    type: 'card',
    name: 'Visa Platinum',
    lastFour: '8765',
    provider: 'Visa',
    isDefault: false,
  },
  {
    id: 'pm-wallet-001',
    type: 'wallet',
    name: 'Apple Pay',
    lastFour: '0001',
    isDefault: false,
  },
  {
    id: 'pm-mobile-001',
    type: 'mobile_money',
    name: 'M-Pesa',
    lastFour: '5555',
    provider: 'M-Pesa',
    isDefault: false,
  },
];

/**
 * Sample transaction confirmation
 */
export const mockTransactionConfirmation: ConversionConfirmation = {
  transactionId: 'TX-1699564900000-xyz789uvw123',
  quoteId: 'QT-1699564800000-abc123def456',
  fromCurrency: 'USD',
  toCurrency: 'EUR',
  fromAmount: 1000,
  toAmount: 920,
  fees: {
    processingFee: 1.5,
    conversionFee: 0.5,
    bankFee: 2.5,
    total: 2.0,
  },
  paymentMethod: mockPaymentMethods[0],
  status: 'processing',
  createdAt: new Date().toISOString(),
};

/**
 * Sample transaction history
 */
export const mockTransactionHistory: TransactionHistory[] = [
  {
    transactionId: 'TX-001',
    fromCurrency: 'USD',
    toCurrency: 'EUR',
    fromAmount: 1000,
    toAmount: 920,
    status: 'completed',
    createdAt: new Date(Date.now() - 7 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 7 * 86400000 + 3600000).toISOString(),
    direction: 'sent',
    conversionType: 'fiat_to_fiat',
  },
  {
    transactionId: 'TX-002',
    fromCurrency: 'EUR',
    toCurrency: 'GBP',
    fromAmount: 500,
    toAmount: 430,
    status: 'completed',
    createdAt: new Date(Date.now() - 5 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 5 * 86400000 + 1800000).toISOString(),
    direction: 'sent',
    conversionType: 'fiat_to_fiat',
  },
  {
    transactionId: 'TX-003',
    fromCurrency: 'GBP',
    toCurrency: 'USD',
    fromAmount: 250,
    toAmount: 315,
    status: 'completed',
    createdAt: new Date(Date.now() - 3 * 86400000).toISOString(),
    completedAt: new Date(Date.now() - 3 * 86400000 + 2400000).toISOString(),
    direction: 'received',
    conversionType: 'fiat_to_fiat',
  },
  {
    transactionId: 'TX-004',
    fromCurrency: 'USD',
    toCurrency: 'JPY',
    fromAmount: 2000,
    toAmount: 299000,
    status: 'processing',
    createdAt: new Date(Date.now() - 1 * 86400000).toISOString(),
    direction: 'sent',
    conversionType: 'fiat_to_fiat',
  },
  {
    transactionId: 'TX-005',
    fromCurrency: 'EUR',
    toCurrency: 'USD',
    fromAmount: 750,
    toAmount: 815,
    status: 'pending',
    createdAt: new Date(Date.now() - 12 * 3600000).toISOString(),
    direction: 'sent',
    conversionType: 'fiat_to_fiat',
  },
  {
    transactionId: 'TX-006',
    fromCurrency: 'USD',
    toCurrency: 'CAD',
    fromAmount: 500,
    toAmount: 680,
    status: 'failed',
    createdAt: new Date(Date.now() - 6 * 3600000).toISOString(),
    direction: 'sent',
    conversionType: 'fiat_to_fiat',
  },
];

/**
 * Sample KYC data
 */
export const mockKYCData: KYCData = {
  status: 'approved',
  level: 2,
  verificationDate: new Date(Date.now() - 30 * 86400000).toISOString(),
  nextReviewDate: new Date(Date.now() + 330 * 86400000).toISOString(),
  documents: [
    {
      id: 'doc-passport-001',
      type: 'passport',
      status: 'verified',
      uploadDate: new Date(Date.now() - 30 * 86400000).toISOString(),
      expiryDate: new Date(Date.now() + 3650 * 86400000).toISOString(),
    },
    {
      id: 'doc-address-001',
      type: 'address_proof',
      status: 'verified',
      uploadDate: new Date(Date.now() - 25 * 86400000).toISOString(),
    },
  ],
  limits: {
    dailyLimit: 10000,
    monthlyLimit: 100000,
    singleTransactionLimit: 5000,
    remainingDaily: 8500,
    remainingMonthly: 76000,
  },
};

/**
 * Helper to generate a quote with custom values
 */
export function createMockQuote(overrides?: Partial<ConversionQuote>): ConversionQuote {
  return {
    ...mockQuote,
    quoteId: `QT-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Helper to generate a transaction with custom values
 */
export function createMockTransaction(
  overrides?: Partial<ConversionConfirmation>
): ConversionConfirmation {
  return {
    ...mockTransactionConfirmation,
    transactionId: `TX-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}
