/**
 * Financial Activities Types
 * Comprehensive types for traditional FIAT financial services
 * Insurance, Payments, Investments, Bills, Loans, Wallets, Trading, KYC, Support, etc.
 * 
 * This module aggregates all financial types from sub-modules:
 * - Wallet Types (walletTypes.ts)
 * - Trading Types (tradingTypes.ts)
 * - Payment Types (paymentTypes.ts)
 * - KYC Types (kycTypes.ts)
 * - Support Types (supportTypes.ts)
 */

// Re-export all wallet types
export * from './walletTypes';

// Re-export all trading types
export * from './tradingTypes';

// Re-export all payment types
export * from './paymentTypes';

// Re-export all KYC types
export * from './kycTypes';

// Re-export all support types
export * from './supportTypes';

// ============================================================================
// INSURANCE TYPES
// ============================================================================

export type InsuranceType = 'HEALTH' | 'AUTO' | 'HOME' | 'TRAVEL' | 'LIFE' | 'DISABILITY';
export type InsuranceCoverageType = 'BASIC' | 'STANDARD' | 'PREMIUM' | 'COMPREHENSIVE';
export type InsuranceStatus = 'ACTIVE' | 'PENDING' | 'EXPIRED' | 'CANCELLED' | 'SUSPENDED';
export type ClaimStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'PAID';

export interface InsurancePolicy {
  id: string;
  userId: string;
  type: InsuranceType;
  coverageType: InsuranceCoverageType;
  provider: string;
  policyNumber: string;
  status: InsuranceStatus;
  premiumAmount: number; // smallest unit
  currency: string;
  coverageAmount: number; // smallest unit
  deductible: number; // smallest unit
  startDate: string;
  expiryDate: string;
  renewalDate?: string;
  documents: {
    policyDocument: string; // URL/path
    beneficiaryForm?: string;
    proofOfPayment?: string;
  };
  beneficiaries?: Beneficiary[];
  nextPremiumDueDate: string;
  premiumFrequency: 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';
  createdAt: string;
  updatedAt: string;
}

export interface Beneficiary {
  id: string;
  name: string;
  relationship: string;
  percentage: number; // 0-100
  email?: string;
  phone?: string;
  address?: string;
}

export interface InsuranceClaim {
  id: string;
  userId: string;
  policyId: string;
  claimNumber: string;
  status: ClaimStatus;
  claimAmount: number; // smallest unit
  claimDate: string;
  incidentDate: string;
  description: string;
  documents: string[]; // URLs/paths to supporting documents
  timeline: ClaimTimeline[];
  approvedAmount?: number; // smallest unit
  paymentMethod: 'BANK_TRANSFER' | 'WALLET' | 'CHECK';
  bankDetails?: {
    accountHolderName: string;
    accountNumber: string;
    routingNumber?: string;
    swiftCode?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface ClaimTimeline {
  id: string;
  status: ClaimStatus;
  timestamp: string;
  notes?: string;
  updatedBy: string;
}

export interface InsuranceQuote {
  id: string;
  type: InsuranceType;
  coverageType: InsuranceCoverageType;
  provider: string;
  estimatedPremium: number; // smallest unit
  currency: string;
  coverageAmount: number; // smallest unit
  deductible: number; // smallest unit
  validUntil: string;
  isCustomizable: boolean;
  features: string[];
}

// ============================================================================
// PAYMENTS & BILLS TYPES
// ============================================================================

export type PaymentMethod = 'BANK_TRANSFER' | 'CARD' | 'WALLET' | 'CHECK' | 'ACH';
export type PaymentStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'REFUNDED';
export type BillStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';
export type BillFrequency = 'ONE_TIME' | 'MONTHLY' | 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL';

export interface Payment {
  id: string;
  userId: string;
  amount: number; // smallest unit
  currency: string;
  status: PaymentStatus;
  description: string;
  paymentMethod: PaymentMethod;
  recipientName: string;
  recipientEmail?: string;
  recipientPhone?: string;
  recipientAccountNumber?: string;
  recipientRoutingNumber?: string;
  note?: string;
  attachments?: string[];
  tags?: string[];
  scheduledDate?: string; // for scheduled payments
  completedAt?: string;
  failureReason?: string;
  referenceNumber?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bill {
  id: string;
  userId: string;
  billerId: string;
  billerName: string;
  billerLogo?: string;
  category: 'UTILITIES' | 'TELECOM' | 'INSURANCE' | 'SUBSCRIPTION' | 'RENT' | 'LOAN' | 'EDUCATION' | 'HEALTHCARE' | 'OTHER';
  amount: number; // smallest unit
  currency: string;
  status: BillStatus;
  dueDate: string;
  frequency: BillFrequency;
  isAutoPay: boolean;
  autoPaidAmount?: number; // smallest unit
  paidAmount: number; // smallest unit
  remainingBalance: number; // smallest unit
  paidDate?: string;
  nextBillDate?: string;
  accountNumber?: string;
  documents?: string[];
  paymentHistory: BillPayment[];
  createdAt: string;
  updatedAt: string;
}

export interface BillPayment {
  id: string;
  billId: string;
  amount: number; // smallest unit
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  paidAt: string;
  confirmationNumber?: string;
}

export interface BillReminder {
  id: string;
  billId: string;
  userId: string;
  reminderDate: string;
  notificationType: 'EMAIL' | 'SMS' | 'PUSH' | 'ALL';
  isEnabled: boolean;
}

// ============================================================================
// INVESTMENT TYPES
// ============================================================================

export type InvestmentType = 'STOCKS' | 'BONDS' | 'MUTUAL_FUNDS' | 'ETF' | 'FOREX' | 'COMMODITIES' | 'REAL_ESTATE' | 'CRYPTO';
export type InvestmentStatus = 'ACTIVE' | 'PENDING' | 'CLOSED' | 'SUSPENDED';
export type PortfolioStrategy = 'CONSERVATIVE' | 'MODERATE' | 'AGGRESSIVE' | 'CUSTOM';

export interface Investment {
  id: string;
  userId: string;
  type: InvestmentType;
  symbol: string;
  name: string;
  quantity: number; // number of shares/units
  purchasePrice: number; // smallest unit - price per unit
  purchaseDate: string;
  currentPrice: number; // smallest unit - price per unit
  status: InvestmentStatus;
  totalInvestment: number; // smallest unit - quantity * purchasePrice
  currentValue: number; // smallest unit - quantity * currentPrice
  unrealizedGain: number; // smallest unit - positive or negative
  unrealizedGainPercent: number;
  realizedGain?: number; // smallest unit
  dividends?: number; // smallest unit - total dividends received
  broker: string;
  accountNumber?: string;
  currency: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
  documents?: string[];
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
}

export interface InvestmentPortfolio {
  id: string;
  userId: string;
  name: string;
  description?: string;
  strategy: PortfolioStrategy;
  totalInvested: number; // smallest unit
  currentValue: number; // smallest unit
  totalReturn: number; // smallest unit
  totalReturnPercent: number;
  investments: Investment[];
  allocations: {
    type: InvestmentType;
    percentage: number;
    value: number; // smallest unit
  }[];
  riskScore: number; // 0-100
  createdAt: string;
  updatedAt: string;
}

export interface InvestmentTransaction {
  id: string;
  investmentId: string;
  type: 'BUY' | 'SELL' | 'DIVIDEND' | 'INTEREST' | 'SPLIT' | 'MERGE';
  quantity?: number; // for buy/sell/split
  price?: number; // smallest unit
  amount: number; // smallest unit
  date: string;
  fees: number; // smallest unit
  confirmationNumber?: string;
  notes?: string;
}

export interface DividendIncome {
  id: string;
  userId: string;
  investmentId: string;
  symbol: string;
  amount: number; // smallest unit
  payoutDate: string;
  recordDate: string;
  exDividendDate: string;
  frequency: 'QUARTERLY' | 'SEMI_ANNUAL' | 'ANNUAL' | 'MONTHLY';
}

// ============================================================================
// LOANS & CREDIT TYPES
// ============================================================================

export type LoanType = 'PERSONAL' | 'HOME' | 'AUTO' | 'STUDENT' | 'BUSINESS' | 'LINE_OF_CREDIT';
export type LoanStatus = 'PENDING' | 'APPROVED' | 'ACTIVE' | 'CLOSED' | 'DEFAULTED';
export type RepaymentFrequency = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY';

export interface Loan {
  id: string;
  userId: string;
  type: LoanType;
  lender: string;
  loanNumber: string;
  status: LoanStatus;
  principalAmount: number; // smallest unit
  currentBalance: number; // smallest unit
  interestRate: number; // percentage
  interestType: 'FIXED' | 'VARIABLE';
  tenure: number; // months
  startDate: string;
  maturityDate: string;
  repaymentFrequency: RepaymentFrequency;
  nextPaymentDueDate: string;
  nextPaymentAmount: number; // smallest unit
  totalInterestPayable: number; // smallest unit
  totalPaid: number; // smallest unit
  currency: string;
  collateral?: string;
  documents?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface LoanPayment {
  id: string;
  loanId: string;
  amount: number; // smallest unit
  principalAmount: number; // smallest unit
  interestAmount: number; // smallest unit
  status: PaymentStatus;
  paymentDate: string;
  dueDate: string;
  paymentMethod: PaymentMethod;
  confirmationNumber?: string;
}

export interface LoanApplication {
  id: string;
  userId: string;
  type: LoanType;
  requestedAmount: number; // smallest unit
  currency: string;
  tenure: number; // months
  purpose: string;
  status: 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'EXPIRED';
  approvedAmount?: number; // smallest unit
  rejectionReason?: string;
  submittedAt: string;
  approvedAt?: string;
  expiresAt?: string;
  documents?: string[];
}

export interface LoanSchedule {
  id: string;
  loanId: string;
  scheduleNumber: number;
  dueDate: string;
  principalAmount: number; // smallest unit
  interestAmount: number; // smallest unit
  totalAmount: number; // smallest unit
  status: PaymentStatus;
  paidAmount?: number; // smallest unit
}

// ============================================================================
// SAVINGS & FIXED DEPOSITS TYPES
// ============================================================================

export type SavingsAccountType = 'REGULAR' | 'FIXED_DEPOSIT' | 'RECURRING_DEPOSIT' | 'HIGH_YIELD';
export type MaturityOption = 'REINVEST' | 'WITHDRAW' | 'PENDING';

export interface SavingsAccount {
  id: string;
  userId: string;
  accountType: SavingsAccountType;
  accountNumber: string;
  bankName: string;
  currency: string;
  balance: number; // smallest unit
  interestRate: number; // percentage
  interestEarned: number; // smallest unit
  interestPaidDate: string;
  minBalance?: number; // smallest unit
  createdAt: string;
  updatedAt: string;
}

export interface FixedDeposit {
  id: string;
  userId: string;
  accountId: string;
  principalAmount: number; // smallest unit
  currency: string;
  interestRate: number; // percentage
  tenure: number; // days
  startDate: string;
  maturityDate: string;
  maturityAmount: number; // smallest unit
  status: 'ACTIVE' | 'MATURED' | 'CLOSED' | 'PREMATURELY_WITHDRAWN';
  maturityOption: MaturityOption;
  isAutoRenewal: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringDeposit {
  id: string;
  userId: string;
  accountId: string;
  monthlyAmount: number; // smallest unit
  currency: string;
  interestRate: number; // percentage
  tenure: number; // months
  startDate: string;
  maturityDate: string;
  totalInvested: number; // smallest unit
  maturityAmount: number; // smallest unit
  status: 'ACTIVE' | 'MATURED' | 'CLOSED';
  depositDay: number; // 1-31
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// BUDGET & EXPENSE TRACKING TYPES
// ============================================================================

export type ExpenseCategory = 
  | 'FOOD' | 'TRANSPORTATION' | 'UTILITIES' | 'ENTERTAINMENT' 
  | 'SHOPPING' | 'HEALTH' | 'EDUCATION' | 'HOUSING' 
  | 'INSURANCE' | 'SAVINGS' | 'INVESTMENTS' | 'OTHER';

export interface Budget {
  id: string;
  userId: string;
  name: string;
  period: 'MONTHLY' | 'QUARTERLY' | 'ANNUAL';
  startDate: string;
  endDate: string;
  totalBudget: number; // smallest unit
  currency: string;
  categories: BudgetCategory[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface BudgetCategory {
  category: ExpenseCategory;
  allocatedAmount: number; // smallest unit
  spentAmount: number; // smallest unit
  remainingAmount: number; // smallest unit
  alertThreshold: number; // percentage (70, 80, 90, etc.)
}

export interface Expense {
  id: string;
  userId: string;
  budgetId?: string;
  category: ExpenseCategory;
  amount: number; // smallest unit
  currency: string;
  description: string;
  paymentMethod: PaymentMethod;
  merchant?: string;
  location?: string;
  date: string;
  receipt?: string; // URL/path
  tags?: string[];
  isRecurring: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// TAX & COMPLIANCE TYPES
// ============================================================================

export type TaxFilingStatus = 'NOT_FILED' | 'SUBMITTED' | 'FILED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED';

export interface TaxReport {
  id: string;
  userId: string;
  taxYear: number;
  filingStatus: TaxFilingStatus;
  grossIncome: number; // smallest unit
  totalDeductions: number; // smallest unit
  taxableIncome: number; // smallest unit
  taxLiability: number; // smallest unit
  documentsRequired: string[];
  documentStatus: {
    [key: string]: 'PENDING' | 'SUBMITTED' | 'VERIFIED';
  };
  submittedAt?: string;
  filedAt?: string;
  refund?: number; // smallest unit
  amountOwed?: number; // smallest unit
}

export interface W2Form {
  id: string;
  userId: string;
  taxYear: number;
  employer: string;
  employerEIN: string;
  wages: number; // smallest unit
  federalTaxWithheld: number; // smallest unit
  socialSecurityWages: number; // smallest unit
  medicareWages: number; // smallest unit;
  states: W2State[];
}

export interface W2State {
  state: string;
  wages: number; // smallest unit
  incomeTax: number; // smallest unit
}

export interface Form1099 {
  id: string;
  userId: string;
  taxYear: number;
  issuer: string;
  form1099Type: 'NEC' | 'MISC' | 'INT' | 'DIV' | 'CAPITAL_GAINS' | 'OTHER';
  grossAmount: number; // smallest unit
}

// ============================================================================
// REWARDS & CASHBACK TYPES
// ============================================================================

export type RewardType = 'POINTS' | 'CASHBACK' | 'MILES' | 'BONUS';
export type RewardStatus = 'EARNED' | 'PENDING' | 'REDEEMED' | 'EXPIRED';

export interface RewardAccount {
  id: string;
  userId: string;
  programName: string;
  programId: string;
  totalPoints: number;
  totalCashback: number; // smallest unit
  totalMiles: number;
  membershipLevel: 'BRONZE' | 'SILVER' | 'GOLD' | 'PLATINUM';
  expiryDate?: string;
  createdAt: string;
}

export interface Reward {
  id: string;
  userId: string;
  accountId: string;
  type: RewardType;
  amount: number;
  value: number; // smallest unit (for cashback/miles conversion)
  description: string;
  status: RewardStatus;
  earnedDate: string;
  expiryDate?: string;
  redeemedDate?: string;
  redeemedAt?: string;
}

export interface RedemptionOption {
  id: string;
  accountId: string;
  name: string;
  description: string;
  pointsCost?: number;
  cashbackValue?: number; // smallest unit
  milesRequired?: number;
  category: 'MERCHANDISE' | 'TRAVEL' | 'CASH' | 'STATEMENT_CREDIT' | 'CHARITY' | 'OTHER';
}

// ============================================================================
// WEALTH MANAGEMENT TYPES
// ============================================================================

export interface NetworthStatement {
  id: string;
  userId: string;
  generatedAt: string;
  assets: {
    bankAccounts: number; // smallest unit
    investments: number; // smallest unit
    realEstate: number; // smallest unit
    vehicles: number; // smallest unit
    otherAssets: number; // smallest unit
    totalAssets: number; // smallest unit
  };
  liabilities: {
    mortgages: number; // smallest unit
    loans: number; // smallest unit
    creditCards: number; // smallest unit
    otherLiabilities: number; // smallest unit
    totalLiabilities: number; // smallest unit
  };
  networth: number; // smallest unit
  currency: string;
}

export interface FinancialGoal {
  id: string;
  userId: string;
  name: string;
  description?: string;
  category: 'SAVINGS' | 'INVESTMENT' | 'DEBT_PAYOFF' | 'EDUCATION' | 'RETIREMENT' | 'MAJOR_PURCHASE' | 'OTHER';
  targetAmount: number; // smallest unit
  currentAmount: number; // smallest unit
  currency: string;
  targetDate: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
  isActive: boolean;
  progress: number; // percentage 0-100
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// FINANCIAL DASHBOARD METRICS
// ============================================================================

export interface FinancialMetrics {
  userId: string;
  totalAssets: number; // smallest unit
  totalLiabilities: number; // smallest unit
  networth: number; // smallest unit
  monthlyIncome: number; // smallest unit
  monthlyExpenses: number; // smallest unit
  monthlySavings: number; // smallest unit
  savingsRate: number; // percentage
  debtToIncomeRatio: number; // percentage
  emergencyFundMonths: number; // number of months covered
  investmentReturnYTD: number; // smallest unit
  investmentReturnPercentageYTD: number; // percentage
  currency: string;
  lastUpdated: string;
}
