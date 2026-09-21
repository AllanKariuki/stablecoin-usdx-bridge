/**
 * Financial Validation Schemas
 * Zod schemas for all financial activity forms
 */

import { z } from 'zod';

// ============================================================================
// INSURANCE SCHEMAS
// ============================================================================

export const insurancePolicyFormSchema = z.object({
  type: z.enum(['HEALTH', 'AUTO', 'HOME', 'TRAVEL', 'LIFE', 'DISABILITY']),
  coverageType: z.enum(['BASIC', 'STANDARD', 'PREMIUM', 'COMPREHENSIVE']),
  provider: z.string().min(2, 'Provider name is required'),
  policyNumber: z.string().min(3, 'Policy number is required'),
  premiumAmount: z.number().positive('Premium amount must be positive'),
  coverageAmount: z.number().positive('Coverage amount must be positive'),
  deductible: z.number().nonnegative('Deductible must be non-negative'),
  startDate: z.string().datetime('Valid start date is required'),
  expiryDate: z.string().datetime('Valid expiry date is required'),
  premiumFrequency: z.enum(['MONTHLY', 'QUARTERLY', 'SEMI_ANNUAL', 'ANNUAL']),
});

export type InsurancePolicyFormData = z.infer<typeof insurancePolicyFormSchema>;

export const insuranceClaimFormSchema = z.object({
  policyId: z.string().uuid('Valid policy ID is required'),
  claimAmount: z.number().positive('Claim amount must be positive'),
  incidentDate: z.string().datetime('Valid incident date is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  documents: z.array(z.string().url('Valid document URLs required')).min(1, 'At least one document is required'),
});

export type InsuranceClaimFormData = z.infer<typeof insuranceClaimFormSchema>;

// ============================================================================
// BILL PAYMENT SCHEMAS
// ============================================================================

export const billPaymentFormSchema = z.object({
  billId: z.string().uuid('Valid bill ID is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'WALLET', 'CHECK', 'ACH']),
  paymentDate: z.string().datetime('Valid payment date is required'),
  notes: z.string().optional(),
});

export type BillPaymentFormData = z.infer<typeof billPaymentFormSchema>;

export const billReminderFormSchema = z.object({
  billId: z.string().uuid('Valid bill ID is required'),
  reminderDate: z.string().datetime('Valid reminder date is required'),
  notificationType: z.enum(['EMAIL', 'SMS', 'PUSH', 'ALL']),
});

export type BillReminderFormData = z.infer<typeof billReminderFormSchema>;

export const autoBillPayFormSchema = z.object({
  billId: z.string().uuid('Valid bill ID is required'),
  enabled: z.boolean(),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'WALLET']),
  scheduleDay: z.number().min(1).max(31, 'Day must be between 1 and 31'),
});

export type AutoBillPayFormData = z.infer<typeof autoBillPayFormSchema>;

// ============================================================================
// INVESTMENT SCHEMAS
// ============================================================================

export const investmentPurchaseFormSchema = z.object({
  type: z.enum(['STOCKS', 'BONDS', 'MUTUAL_FUNDS', 'ETF', 'FOREX', 'COMMODITIES', 'REAL_ESTATE', 'CRYPTO']),
  symbol: z.string().min(1, 'Symbol is required'),
  quantity: z.number().positive('Quantity must be positive'),
  purchasePrice: z.number().positive('Purchase price must be positive'),
  broker: z.string().min(2, 'Broker name is required'),
  riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH']),
});

export type InvestmentPurchaseFormData = z.infer<typeof investmentPurchaseFormSchema>;

export const investmentSellFormSchema = z.object({
  investmentId: z.string().uuid('Valid investment ID is required'),
  quantity: z.number().positive('Quantity must be positive'),
  salePrice: z.number().positive('Sale price must be positive'),
  tradingFee: z.number().nonnegative('Trading fee must be non-negative'),
});

export type InvestmentSellFormData = z.infer<typeof investmentSellFormSchema>;

export const portfolioGoalFormSchema = z.object({
  name: z.string().min(3, 'Goal name must be at least 3 characters'),
  description: z.string().optional(),
  strategy: z.enum(['CONSERVATIVE', 'MODERATE', 'AGGRESSIVE', 'CUSTOM']),
  targetAmount: z.number().positive('Target amount must be positive'),
  targetDate: z.string().datetime('Valid target date is required'),
});

export type PortfolioGoalFormData = z.infer<typeof portfolioGoalFormSchema>;

// ============================================================================
// LOAN SCHEMAS
// ============================================================================

export const loanApplicationFormSchema = z.object({
  type: z.enum(['PERSONAL', 'HOME', 'AUTO', 'STUDENT', 'BUSINESS', 'LINE_OF_CREDIT']),
  requestedAmount: z.number().positive('Requested amount must be positive'),
  tenure: z.number().positive('Tenure in months must be positive'),
  purpose: z.string().min(10, 'Purpose must be at least 10 characters'),
  documents: z.array(z.string().url()).optional(),
});

export type LoanApplicationFormData = z.infer<typeof loanApplicationFormSchema>;

export const loanPaymentFormSchema = z.object({
  loanId: z.string().uuid('Valid loan ID is required'),
  amount: z.number().positive('Amount must be positive'),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'WALLET', 'ACH']),
  paymentDate: z.string().datetime('Valid payment date is required'),
  notes: z.string().optional(),
});

export type LoanPaymentFormData = z.infer<typeof loanPaymentFormSchema>;

export const loanPrepaymentFormSchema = z.object({
  loanId: z.string().uuid('Valid loan ID is required'),
  prepaymentAmount: z.number().positive('Prepayment amount must be positive'),
  applyTowardsPrincipal: z.boolean().default(true),
});

export type LoanPrepaymentFormData = z.infer<typeof loanPrepaymentFormSchema>;

// ============================================================================
// SAVINGS & DEPOSITS SCHEMAS
// ============================================================================

export const fixedDepositFormSchema = z.object({
  accountId: z.string().uuid('Valid account ID is required'),
  principalAmount: z.number().positive('Principal amount must be positive'),
  tenure: z.number().positive('Tenure in days must be positive'),
  interestRate: z.number().nonnegative('Interest rate must be non-negative'),
  maturityOption: z.enum(['REINVEST', 'WITHDRAW', 'PENDING']).default('WITHDRAW'),
  autoRenewal: z.boolean().default(false),
});

export type FixedDepositFormData = z.infer<typeof fixedDepositFormSchema>;

export const recurringDepositFormSchema = z.object({
  accountId: z.string().uuid('Valid account ID is required'),
  monthlyAmount: z.number().positive('Monthly amount must be positive'),
  tenure: z.number().positive('Tenure in months must be positive'),
  depositDay: z.number().min(1).max(31, 'Day must be between 1 and 31'),
  interestRate: z.number().nonnegative('Interest rate must be non-negative'),
});

export type RecurringDepositFormData = z.infer<typeof recurringDepositFormSchema>;

// ============================================================================
// BUDGET & EXPENSE SCHEMAS
// ============================================================================

export const budgetFormSchema = z.object({
  name: z.string().min(3, 'Budget name must be at least 3 characters'),
  period: z.enum(['MONTHLY', 'QUARTERLY', 'ANNUAL']),
  totalBudget: z.number().positive('Total budget must be positive'),
  categories: z.array(
    z.object({
      category: z.enum([
        'FOOD', 'TRANSPORTATION', 'UTILITIES', 'ENTERTAINMENT',
        'SHOPPING', 'HEALTH', 'EDUCATION', 'HOUSING',
        'INSURANCE', 'SAVINGS', 'INVESTMENTS', 'OTHER'
      ]),
      allocatedAmount: z.number().positive('Allocated amount must be positive'),
      alertThreshold: z.number().min(50).max(100, 'Alert threshold must be 50-100%'),
    })
  ),
});

export type BudgetFormData = z.infer<typeof budgetFormSchema>;

export const expenseFormSchema = z.object({
  category: z.enum([
    'FOOD', 'TRANSPORTATION', 'UTILITIES', 'ENTERTAINMENT',
    'SHOPPING', 'HEALTH', 'EDUCATION', 'HOUSING',
    'INSURANCE', 'SAVINGS', 'INVESTMENTS', 'OTHER'
  ]),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().min(3, 'Description is required'),
  paymentMethod: z.enum(['BANK_TRANSFER', 'CARD', 'WALLET', 'CHECK', 'ACH']),
  date: z.string().datetime('Valid date is required'),
  merchant: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export type ExpenseFormData = z.infer<typeof expenseFormSchema>;

// ============================================================================
// TAX SCHEMAS
// ============================================================================

export const taxReportFormSchema = z.object({
  taxYear: z.number().min(2000).max(2100),
  grossIncome: z.number().nonnegative('Gross income must be non-negative'),
  deductions: z.number().nonnegative('Deductions must be non-negative'),
  documentsRequired: z.array(z.string()),
});

export type TaxReportFormData = z.infer<typeof taxReportFormSchema>;

export const w2FormSchema = z.object({
  taxYear: z.number().min(2000).max(2100),
  employer: z.string().min(2, 'Employer name is required'),
  employerEIN: z.string().regex(/^\d{2}-\d{7}$/, 'Invalid EIN format'),
  wages: z.number().nonnegative('Wages must be non-negative'),
  federalTaxWithheld: z.number().nonnegative('Federal tax withheld must be non-negative'),
});

export type W2FormData = z.infer<typeof w2FormSchema>;

// ============================================================================
// FINANCIAL GOALS SCHEMAS
// ============================================================================

export const financialGoalFormSchema = z.object({
  name: z.string().min(3, 'Goal name must be at least 3 characters'),
  description: z.string().optional(),
  category: z.enum(['SAVINGS', 'INVESTMENT', 'DEBT_PAYOFF', 'EDUCATION', 'RETIREMENT', 'MAJOR_PURCHASE', 'OTHER']),
  targetAmount: z.number().positive('Target amount must be positive'),
  targetDate: z.string().datetime('Valid target date is required'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export type FinancialGoalFormData = z.infer<typeof financialGoalFormSchema>;

// ============================================================================
// COMBINED VALIDATION SCHEMAS
// ============================================================================

export const allFinancialFormSchemas = {
  insurance: {
    policy: insurancePolicyFormSchema,
    claim: insuranceClaimFormSchema,
  },
  billing: {
    payment: billPaymentFormSchema,
    reminder: billReminderFormSchema,
    autoPay: autoBillPayFormSchema,
  },
  investment: {
    purchase: investmentPurchaseFormSchema,
    sell: investmentSellFormSchema,
    goal: portfolioGoalFormSchema,
  },
  loans: {
    application: loanApplicationFormSchema,
    payment: loanPaymentFormSchema,
    prepayment: loanPrepaymentFormSchema,
  },
  savings: {
    fixedDeposit: fixedDepositFormSchema,
    recurringDeposit: recurringDepositFormSchema,
  },
  budget: {
    create: budgetFormSchema,
    expense: expenseFormSchema,
  },
  tax: {
    report: taxReportFormSchema,
    w2: w2FormSchema,
  },
  goals: {
    create: financialGoalFormSchema,
  },
};
