/**
 * Money Utility Functions
 * 
 * CRITICAL: All monetary values in the application are stored and transmitted
 * as smallest-unit integers (satoshis for BTC, cents for USD, etc.)
 * 
 * These utilities handle conversion between human-readable decimals and
 * smallest-unit integers, as well as formatting for display.
 */

import { Currency } from '@/types/api';

/**
 * Currency configuration
 * decimals: number of decimal places (8 for BTC, 2 for USD)
 * symbol: display symbol
 * name: full currency name
 */
export const CURRENCY_CONFIG: Record<Currency, { decimals: number; symbol: string; name: string }> = {
  BTC: { decimals: 8, symbol: '₿', name: 'Bitcoin' },
  ETH: { decimals: 18, symbol: 'Ξ', name: 'Ethereum' },
  USDC: { decimals: 6, symbol: 'USDC', name: 'USD Coin' },
  USDT: { decimals: 6, symbol: 'USDT', name: 'Tether' },
  USD: { decimals: 2, symbol: '$', name: 'US Dollar' },
  EUR: { decimals: 2, symbol: '€', name: 'Euro' },
  KES: { decimals: 2, symbol: 'KSh', name: 'Kenyan Shilling' },
};

/**
 * Convert a human-readable decimal amount to smallest unit integer
 * 
 * @example
 * toSmallestUnit(1.5, 8) // returns 150000000 (1.5 BTC in satoshis)
 * toSmallestUnit(50.00, 2) // returns 5000 ($50.00 in cents)
 */
export function toSmallestUnit(amount: number | string, decimals: number): number {
  const numAmount = typeof amount === 'string' ? parseFloat(amount) : amount;
  
  if (isNaN(numAmount)) {
    throw new Error(`Invalid amount: ${amount}`);
  }
  
  // Use Math.round to handle floating point precision issues
  return Math.round(numAmount * Math.pow(10, decimals));
}

/**
 * Convert smallest unit integer to human-readable decimal
 * 
 * @example
 * fromSmallestUnit(150000000, 8) // returns 1.5 (satoshis to BTC)
 * fromSmallestUnit(5000, 2) // returns 50.00 (cents to USD)
 */
export function fromSmallestUnit(amount: number, decimals: number): number {
  return amount / Math.pow(10, decimals);
}

/**
 * Format a smallest-unit integer amount for display
 * 
 * @example
 * formatCurrency(150000000, 'BTC') // returns "₿1.50000000"
 * formatCurrency(5000, 'USD') // returns "$50.00"
 * formatCurrency(5000, 'USD', { compact: true }) // returns "$50"
 */
export function formatCurrency(
  amount: number,
  currency: Currency,
  options: {
    compact?: boolean; // remove trailing zeros
    showSymbol?: boolean;
    showCode?: boolean;
    locale?: string;
  } = {}
): string {
  const {
    compact = false,
    showSymbol = true,
    showCode = false,
    locale = 'en-US',
  } = options;

  const config = CURRENCY_CONFIG[currency];
  const decimalAmount = fromSmallestUnit(amount, config.decimals);

  const formatter = new Intl.NumberFormat(locale, {
    minimumFractionDigits: compact ? 0 : config.decimals,
    maximumFractionDigits: config.decimals,
  });

  const formattedNumber = formatter.format(decimalAmount);
  
  let result = '';
  
  if (showSymbol) {
    result = `${config.symbol}${formattedNumber}`;
  } else {
    result = formattedNumber;
  }
  
  if (showCode) {
    result = `${result} ${currency}`;
  }
  
  return result;
}

/**
 * Format amount with abbreviated suffixes (K, M, B)
 * 
 * @example
 * formatCompactCurrency(1500000, 'USD') // returns "$15K"
 * formatCompactCurrency(2500000000, 'USD') // returns "$25M"
 */
export function formatCompactCurrency(amount: number, currency: Currency): string {
  const config = CURRENCY_CONFIG[currency];
  const decimalAmount = fromSmallestUnit(amount, config.decimals);

  const formatter = new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
    maximumFractionDigits: 2,
  });

  return `${config.symbol}${formatter.format(decimalAmount)}`;
}

/**
 * Calculate percentage of portfolio
 */
export function calculatePortfolioPercentage(amount: number, totalPortfolio: number): number {
  if (totalPortfolio === 0) return 0;
  return (amount / totalPortfolio) * 100;
}

/**
 * Calculate price change percentage
 */
export function calculatePriceChange(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/**
 * Format percentage with sign
 * 
 * @example
 * formatPercentage(5.25) // returns "+5.25%"
 * formatPercentage(-2.5) // returns "-2.50%"
 */
export function formatPercentage(value: number, decimals: number = 2): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Validate amount is within min/max bounds
 */
export function validateAmount(
  amount: number,
  min: number,
  max: number,
  currency: Currency
): { valid: boolean; error?: string } {
  if (amount < min) {
    return {
      valid: false,
      error: `Minimum amount is ${formatCurrency(min, currency)}`,
    };
  }
  
  if (amount > max) {
    return {
      valid: false,
      error: `Maximum amount is ${formatCurrency(max, currency)}`,
    };
  }
  
  return { valid: true };
}

/**
 * Calculate trading fee
 */
export function calculateFee(amount: number, feeRateBasisPoints: number): number {
  // Fee rate is in basis points (1 bp = 0.01%)
  // e.g., 10 bp = 0.10% = 0.001
  return Math.round((amount * feeRateBasisPoints) / 10000);
}

/**
 * Calculate total with fee
 */
export function calculateTotalWithFee(
  amount: number,
  feeRateBasisPoints: number,
  side: 'BUY' | 'SELL'
): {
  amount: number;
  fee: number;
  total: number;
} {
  const fee = calculateFee(amount, feeRateBasisPoints);
  const total = side === 'BUY' ? amount + fee : amount - fee;
  
  return { amount, fee, total };
}

/**
 * Parse user input string to smallest unit
 * Handles various formats: "1.5", "1,500.50", etc.
 */
export function parseAmountInput(input: string, currency: Currency): number | null {
  if (!input || input.trim() === '') return null;
  
  // Remove commas and other non-numeric characters except decimal point
  const cleaned = input.replace(/[^0-9.]/g, '');
  
  const parsed = parseFloat(cleaned);
  
  if (isNaN(parsed)) return null;
  
  try {
    return toSmallestUnit(parsed, CURRENCY_CONFIG[currency].decimals);
  } catch {
    return null;
  }
}

/**
 * Check if balance is sufficient for amount + fee
 */
export function hasSufficientBalance(
  balance: number,
  amount: number,
  fee: number
): boolean {
  return balance >= amount + fee;
}

/**
 * Get maximum spendable amount (balance - estimated fee)
 */
export function getMaxSpendableAmount(
  balance: number,
  feeRateBasisPoints: number
): number {
  // Iteratively calculate since fee depends on amount
  // amount + fee = balance
  // amount + (amount * rate) = balance
  // amount * (1 + rate) = balance
  // amount = balance / (1 + rate)
  
  const rate = feeRateBasisPoints / 10000;
  return Math.floor(balance / (1 + rate));
}
