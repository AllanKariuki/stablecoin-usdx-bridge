/**
 * Financial Utilities
 * 
 * Helper functions for financial calculations, formatting, and operations
 * Handles:
 * - Money conversions and formatting
 * - Investment calculations
 * - Loan amortization
 * - Budget tracking
 * - Tax calculations
 * - Interest calculations
 */

// ============================================================================
// MONEY & CURRENCY UTILITIES
// ============================================================================

/**
 * Format currency amount for display
 * @param amount Amount in smallest unit (cents, satoshis, etc.)
 * @param currency Currency code (USD, EUR, BTC, etc.)
 * @param locale Locale for formatting (default: 'en-US')
 */
export const formatCurrencyAmount = (
  amount: number,
  currency: string = 'USD',
  locale: string = 'en-US'
): string => {
  const formatter = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
    maximumFractionDigits: 8,
  });

  // Convert from smallest unit
  const divisor = currency === 'BTC' || currency === 'ETH' ? 100000000 : 100;
  return formatter.format(amount / divisor);
};

/**
 * Parse currency input and return smallest unit
 */
export const parseCurrencyInput = (
  input: string,
  currency: string = 'USD'
): number => {
  const amount = parseFloat(input);
  if (isNaN(amount)) return 0;

  const divisor = currency === 'BTC' || currency === 'ETH' ? 100000000 : 100;
  return Math.round(amount * divisor);
};

/**
 * Convert amount from smallest unit to decimal
 */
export const fromSmallestUnit = (
  amount: number,
  currency: string = 'USD'
): number => {
  const divisor = currency === 'BTC' || currency === 'ETH' ? 100000000 : 100;
  return amount / divisor;
};

/**
 * Convert decimal amount to smallest unit
 */
export const toSmallestUnit = (
  amount: number,
  currency: string = 'USD'
): number => {
  const divisor = currency === 'BTC' || currency === 'ETH' ? 100000000 : 100;
  return Math.round(amount * divisor);
};

// ============================================================================
// INVESTMENT CALCULATIONS
// ============================================================================

/**
 * Calculate unrealized gain/loss for an investment
 */
export const calculateUnrealizedGainLoss = (
  quantity: number,
  purchasePrice: number,
  currentPrice: number
): { gain: number; gainPercent: number } => {
  const gain = quantity * (currentPrice - purchasePrice);
  const costBasis = quantity * purchasePrice;
  const gainPercent = costBasis > 0 ? (gain / costBasis) * 100 : 0;

  return { gain, gainPercent };
};

/**
 * Calculate portfolio allocation percentage
 */
export const calculateAllocationPercentage = (
  investmentValue: number,
  portfolioTotal: number
): number => {
  return portfolioTotal > 0 ? (investmentValue / portfolioTotal) * 100 : 0;
};

/**
 * Calculate compound annual growth rate (CAGR)
 */
export const calculateCAGR = (
  beginValue: number,
  endValue: number,
  years: number
): number => {
  if (beginValue <= 0 || years <= 0) return 0;
  return (Math.pow(endValue / beginValue, 1 / years) - 1) * 100;
};

/**
 * Calculate annualized return
 */
export const calculateAnnualizedReturn = (
  startValue: number,
  endValue: number,
  days: number
): number => {
  if (startValue <= 0) return 0;
  const totalReturn = ((endValue - startValue) / startValue) * 100;
  const years = days / 365;
  if (years <= 0) return totalReturn;
  return totalReturn / years;
};

// ============================================================================
// LOAN & CREDIT CALCULATIONS
// ============================================================================

/**
 * Calculate loan amortization schedule
 */
export const generateAmortizationSchedule = (
  principal: number,
  annualRate: number,
  monthlyPayments: number
): AmortizationSchedule[] => {
  const schedule: AmortizationSchedule[] = [];
  const monthlyRate = annualRate / 100 / 12;
  let balance = principal;
  const monthlyPayment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, monthlyPayments))) /
    (Math.pow(1 + monthlyRate, monthlyPayments) - 1);

  for (let month = 1; month <= monthlyPayments; month++) {
    const interest = balance * monthlyRate;
    const principalPayment = monthlyPayment - interest;
    balance -= principalPayment;

    schedule.push({
      month,
      payment: monthlyPayment,
      principal: principalPayment,
      interest,
      balance: Math.max(0, balance),
    });
  }

  return schedule;
};

export interface AmortizationSchedule {
  month: number;
  payment: number;
  principal: number;
  interest: number;
  balance: number;
}

/**
 * Calculate monthly loan payment
 */
export const calculateLoanPayment = (
  principal: number,
  annualRate: number,
  months: number
): number => {
  if (annualRate === 0) {
    return principal / months;
  }

  const monthlyRate = annualRate / 100 / 12;
  const payment =
    (principal * (monthlyRate * Math.pow(1 + monthlyRate, months))) /
    (Math.pow(1 + monthlyRate, months) - 1);

  return payment;
};

/**
 * Calculate total interest paid on a loan
 */
export const calculateTotalInterest = (
  monthlyPayment: number,
  months: number,
  principal: number
): number => {
  return monthlyPayment * months - principal;
};

/**
 * Calculate debt-to-income ratio
 */
export const calculateDebtToIncomeRatio = (
  totalMonthlyDebt: number,
  monthlyGrossIncome: number
): number => {
  if (monthlyGrossIncome <= 0) return 0;
  return (totalMonthlyDebt / monthlyGrossIncome) * 100;
};

// ============================================================================
// SAVINGS & INTEREST CALCULATIONS
// ============================================================================

/**
 * Calculate simple interest earned
 */
export const calculateSimpleInterest = (
  principal: number,
  rate: number,
  days: number
): number => {
  return (principal * rate * days) / (100 * 365);
};

/**
 * Calculate compound interest
 */
export const calculateCompoundInterest = (
  principal: number,
  rate: number,
  compoundingPeriods: number,
  years: number
): number => {
  const amount =
    principal * Math.pow(1 + rate / 100 / compoundingPeriods, compoundingPeriods * years);
  return amount - principal;
};

/**
 * Calculate fixed deposit maturity amount
 */
export const calculateFDMaturityAmount = (
  principal: number,
  annualRate: number,
  days: number
): number => {
  const years = days / 365;
  const interest = calculateSimpleInterest(principal, annualRate, days);
  return principal + interest;
};

/**
 * Calculate recurring deposit maturity
 */
export const calculateRDMaturityAmount = (
  monthlyDeposit: number,
  annualRate: number,
  months: number
): number => {
  const monthlyRate = annualRate / 100 / 12;
  const maturityAmount =
    monthlyDeposit *
    (((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate) *
      (1 + monthlyRate));
  return maturityAmount;
};

// ============================================================================
// BUDGET & EXPENSE TRACKING
// ============================================================================

/**
 * Calculate budget utilization percentage
 */
export const calculateBudgetUsage = (
  spent: number,
  budgetAmount: number
): number => {
  if (budgetAmount <= 0) return 0;
  return (spent / budgetAmount) * 100;
};

/**
 * Calculate monthly average spending
 */
export const calculateAverageSpending = (expenses: number[], months: number): number => {
  if (months <= 0 || expenses.length === 0) return 0;
  return expenses.reduce((sum, exp) => sum + exp, 0) / months;
};

/**
 * Calculate spending trends
 */
export const calculateSpendingTrend = (
  currentMonth: number,
  previousMonth: number
): { change: number; changePercent: number } => {
  const change = currentMonth - previousMonth;
  const changePercent =
    previousMonth > 0 ? (change / previousMonth) * 100 : change > 0 ? 100 : -100;

  return { change, changePercent };
};

// ============================================================================
// TAX CALCULATIONS
// ============================================================================

/**
 * Calculate estimated tax liability (US Federal - simplified)
 */
export const calculateEstimatedTax = (
  grossIncome: number,
  filingStatus: 'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD' = 'SINGLE'
): number => {
  // 2024 Tax Brackets (simplified)
  const brackets = {
    SINGLE: [
      { limit: 11600, rate: 0.1 },
      { limit: 47150, rate: 0.12 },
      { limit: 100525, rate: 0.22 },
      { limit: 191950, rate: 0.24 },
      { limit: 243725, rate: 0.32 },
      { limit: 609350, rate: 0.35 },
      { limit: Infinity, rate: 0.37 },
    ],
    MARRIED: [
      { limit: 23200, rate: 0.1 },
      { limit: 94300, rate: 0.12 },
      { limit: 201050, rate: 0.22 },
      { limit: 383900, rate: 0.24 },
      { limit: 487450, rate: 0.32 },
      { limit: 731200, rate: 0.35 },
      { limit: Infinity, rate: 0.37 },
    ],
    HEAD_OF_HOUSEHOLD: [
      { limit: 17450, rate: 0.1 },
      { limit: 66550, rate: 0.12 },
      { limit: 112200, rate: 0.22 },
      { limit: 191850, rate: 0.24 },
      { limit: 243700, rate: 0.32 },
      { limit: 609350, rate: 0.35 },
      { limit: Infinity, rate: 0.37 },
    ],
  };

  const taxBrackets = brackets[filingStatus];
  let tax = 0;
  let previousLimit = 0;

  for (const bracket of taxBrackets) {
    if (grossIncome <= previousLimit) break;

    const taxableInBracket = Math.min(grossIncome, bracket.limit) - previousLimit;
    tax += taxableInBracket * bracket.rate;
    previousLimit = bracket.limit;
  }

  return tax;
};

/**
 * Calculate capital gains tax (US Long-term)
 */
export const calculateCapitalGainsTax = (
  gain: number,
  holdingPeriodMonths: number,
  filingStatus: 'SINGLE' | 'MARRIED' | 'HEAD_OF_HOUSEHOLD' = 'SINGLE'
): number => {
  if (gain <= 0) return 0;

  const isLongTerm = holdingPeriodMonths >= 12;
  const rates = {
    SINGLE: isLongTerm ? [0.0, 0.15, 0.2] : [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
    MARRIED: isLongTerm ? [0.0, 0.15, 0.2] : [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
    HEAD_OF_HOUSEHOLD: isLongTerm ? [0.0, 0.15, 0.2] : [0.1, 0.12, 0.22, 0.24, 0.32, 0.35, 0.37],
  };

  // Simplified calculation - use 15% for long-term
  const rate = isLongTerm ? 0.15 : 0.25;
  return gain * rate;
};

// ============================================================================
// WEALTH & NET WORTH CALCULATIONS
// ============================================================================

/**
 * Calculate net worth
 */
export const calculateNetworth = (
  totalAssets: number,
  totalLiabilities: number
): number => {
  return totalAssets - totalLiabilities;
};

/**
 * Calculate savings rate
 */
export const calculateSavingsRate = (
  income: number,
  expenses: number
): number => {
  if (income <= 0) return 0;
  return ((income - expenses) / income) * 100;
};

/**
 * Calculate emergency fund months
 */
export const calculateEmergencyFundMonths = (
  emergencyFund: number,
  monthlyExpenses: number
): number => {
  if (monthlyExpenses <= 0) return 0;
  return emergencyFund / monthlyExpenses;
};

// ============================================================================
// INSURANCE CALCULATIONS
// ============================================================================

/**
 * Calculate insurance premium with risk adjustments
 */
export const calculateInsurancePremium = (
  baseAmount: number,
  riskFactor: number = 1.0,
  frequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' = 'ANNUAL'
): number => {
  const adjusted = baseAmount * riskFactor;

  const frequencyDivisor = {
    MONTHLY: 12,
    QUARTERLY: 4,
    SEMI_ANNUAL: 2,
    ANNUAL: 1,
  };

  return adjusted / frequencyDivisor[frequency];
};

/**
 * Calculate coverage adequacy (Life Insurance)
 */
export const calculateCoverageAdequacy = (
  annualIncome: number,
  dependents: number,
  existingDebts: number
): number => {
  // Rule of thumb: 10x annual income + dependents multiplier + debts
  const baseAmount = annualIncome * 10;
  const dependentMultiplier = 1 + dependents * 0.5;
  const totalNeeded = baseAmount * dependentMultiplier + existingDebts;

  return totalNeeded;
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Round amount to nearest currency unit
 */
export const roundAmount = (amount: number, decimals: number = 2): number => {
  return Math.round(amount * Math.pow(10, decimals)) / Math.pow(10, decimals);
};

/**
 * Check if amount is sufficient
 */
export const hasSufficientFunds = (
  available: number,
  required: number,
  includeBuffer: boolean = false,
  bufferPercent: number = 0
): boolean => {
  if (includeBuffer) {
    const buffer = required * (bufferPercent / 100);
    return available >= required + buffer;
  }
  return available >= required;
};

/**
 * Calculate percentage change
 */
export const calculatePercentageChange = (
  oldValue: number,
  newValue: number
): number => {
  if (oldValue === 0) return newValue > 0 ? 100 : -100;
  return ((newValue - oldValue) / Math.abs(oldValue)) * 100;
};

/**
 * Format percentage for display
 */
export const formatPercentage = (
  value: number,
  decimals: number = 2,
  includeSign: boolean = true
): string => {
  const formatted = value.toFixed(decimals);
  const sign = includeSign && value > 0 ? '+' : '';
  return `${sign}${formatted}%`;
};
