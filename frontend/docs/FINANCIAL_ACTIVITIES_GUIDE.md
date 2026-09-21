# Financial Activities Enhancement Guide

Comprehensive guide for implementing traditional FIAT financial services alongside crypto trading in the DAMP platform.

## Overview

The DAMP platform has been enhanced to support a complete suite of financial services beyond cryptocurrency trading, including:

- **Insurance Management** (Health, Auto, Home, Travel, Life)
- **Bill Payments & Recurring Expenses**
- **Investment Portfolio Management** (Stocks, Bonds, Mutual Funds, ETFs, etc.)
- **Loan & Credit Management** (Personal, Home, Auto, Student)
- **Savings Accounts & Fixed/Recurring Deposits**
- **Budget & Expense Tracking**
- **Tax Management & Compliance**
- **Financial Goals & Wealth Management**
- **Rewards & Cashback Programs**
- **Net Worth & Financial Metrics**

## File Structure

```
src/
├── types/financial/
│   └── index.ts                    # All financial activity type definitions
├── components/financial/
│   ├── insurance/
│   │   ├── InsurancePolicyCard.tsx
│   │   ├── InsuranceClaimForm.tsx
│   │   ├── ClaimsList.tsx
│   │   └── RenewalReminder.tsx
│   ├── payments/
│   │   ├── BillPaymentCard.tsx
│   │   ├── BillPaymentForm.tsx
│   │   ├── BillsList.tsx
│   │   └── AutoPaySetup.tsx
│   ├── investments/
│   │   ├── InvestmentCard.tsx
│   │   ├── PortfolioOverview.tsx
│   │   ├── BuyInvestmentForm.tsx
│   │   ├── SellInvestmentForm.tsx
│   │   └── AllocationChart.tsx
│   ├── loans/
│   │   ├── LoanCard.tsx
│   │   ├── LoanPaymentForm.tsx
│   │   ├── LoansList.tsx
│   │   ├── AmortizationSchedule.tsx
│   │   └── PrepaymentCalculator.tsx
│   ├── savings/
│   │   ├── SavingsAccountCard.tsx
│   │   ├── FixedDepositForm.tsx
│   │   ├── RecurringDepositForm.tsx
│   │   └── InterestCalculator.tsx
│   ├── budget/
│   │   ├── BudgetCard.tsx
│   │   ├── BudgetForm.tsx
│   │   ├── ExpenseForm.tsx
│   │   ├── ExpensesList.tsx
│   │   └── CategoryBreakdown.tsx
│   ├── goals/
│   │   ├── GoalCard.tsx
│   │   ├── GoalForm.tsx
│   │   ├── GoalsList.tsx
│   │   └── ProgressTracker.tsx
│   ├── tax/
│   │   ├── TaxReportCard.tsx
│   │   ├── DocumentUploadForm.tsx
│   │   └── TaxSummary.tsx
│   └── wealth/
│       ├── NetworthCard.tsx
│       └── FinancialMetricsDashboard.tsx
├── lib/
│   ├── utils/
│   │   └── financial.ts             # Financial calculation utilities
│   ├── api/
│   │   └── financial.ts             # API client functions
│   └── validation/
│       └── financial.ts             # Zod validation schemas
├── pages/
│   ├── EnhancedDashboard.tsx        # Main financial dashboard
│   └── financial/
│       ├── Insurance.tsx
│       ├── Bills.tsx
│       ├── Investments.tsx
│       ├── Loans.tsx
│       ├── Savings.tsx
│       ├── Budget.tsx
│       ├── Goals.tsx
│       ├── Tax.tsx
│       └── Wealth.tsx
└── hooks/
    ├── useInsurance.ts
    ├── useBills.ts
    ├── useInvestments.ts
    ├── useLoans.ts
    ├── useSavings.ts
    ├── useBudget.ts
    └── useFinancialMetrics.ts
```

## Component Implementation Details

### 1. Insurance Management

#### InsurancePolicyCard
- Displays policy details: type, provider, premium, coverage
- Shows expiration status with warning indicators
- Quick actions: View Details, File Claim, Renew
- Status badges for different policy states

**Props:**
```typescript
interface InsurancePolicyCardProps {
  policy: InsurancePolicy;
  onView?: (policyId: string) => void;
  onRenew?: (policyId: string) => void;
  onClaim?: (policyId: string) => void;
}
```

#### Related Components (To Implement)
- `InsuranceClaimForm` - Multi-step claim submission
- `ClaimsList` - View and track insurance claims
- `RenewalReminder` - Auto-renewal suggestions

### 2. Bill Payments

#### BillPaymentCard
- Biller information and logo
- Amount due with payment status
- Due date with visual indicators
- Payment history
- Quick pay and schedule buttons

**Props:**
```typescript
interface BillPaymentCardProps {
  bill: Bill;
  onPay?: (billId: string) => void;
  onSchedule?: (billId: string) => void;
  onViewDetails?: (billId: string) => void;
}
```

#### Related Components (To Implement)
- `BillPaymentForm` - Process bill payment
- `BillsList` - View all bills with filtering
- `AutoPaySetup` - Configure automatic bill payments

### 3. Investments

#### InvestmentCard
- Symbol, name, type, and risk level
- Current price and quantity
- Total investment vs. current value
- Unrealized gains/losses with percentage
- Status and broker information
- Quick actions: View Details, Sell

**Props:**
```typescript
interface InvestmentCardProps {
  investment: Investment;
  onView?: (investmentId: string) => void;
  onSell?: (investmentId: string) => void;
}
```

#### Related Components (To Implement)
- `PortfolioOverview` - Dashboard showing total portfolio value
- `BuyInvestmentForm` - Purchase new investments
- `SellInvestmentForm` - Sell existing investments
- `AllocationChart` - Pie/donut chart of portfolio allocation

### 4. Loans

#### LoanCard
- Loan type and lender information
- Principal and current balance
- Interest rate and remaining tenure
- Payment progress with visual indicator
- Total interest and amount paid
- Next payment details
- Quick actions: View, Pay, Prepay

**Props:**
```typescript
interface LoanCardProps {
  loan: Loan;
  onView?: (loanId: string) => void;
  onPayment?: (loanId: string) => void;
  onPrepayment?: (loanId: string) => void;
}
```

#### Related Components (To Implement)
- `LoanPaymentForm` - Process loan payment
- `LoansList` - View all loans
- `AmortizationSchedule` - Detailed payment schedule
- `PrepaymentCalculator` - Calculate prepayment benefits

### 5. Savings & Deposits

#### Components to Implement
- `SavingsAccountCard` - Display account balances and interest
- `FixedDepositForm` - Create fixed deposits
- `RecurringDepositForm` - Set up recurring deposits
- `InterestCalculator` - Calculate maturity amounts

### 6. Budget & Expense Tracking

#### Components to Implement
- `BudgetCard` - Display budget with progress
- `BudgetForm` - Create/edit budgets
- `ExpenseForm` - Log expenses
- `ExpensesList` - View and filter expenses
- `CategoryBreakdown` - Visual breakdown by category

### 7. Financial Goals

#### Components to Implement
- `GoalCard` - Display individual goal with progress
- `GoalForm` - Create/edit goals
- `GoalsList` - View all goals
- `ProgressTracker` - Track progress towards goals

### 8. Tax Management

#### Components to Implement
- `TaxReportCard` - Display tax information
- `DocumentUploadForm` - Upload tax documents
- `TaxSummary` - Summary of tax obligations

## Utility Functions Reference

### Money & Currency
```typescript
// Format for display
formatCurrencyAmount(amount, 'USD')  // "$123.45"

// Parse user input
parseCurrencyInput('123.45', 'USD')  // 12345 (in cents)

// Convert units
fromSmallestUnit(12345, 'USD')       // 123.45
toSmallestUnit(123.45, 'USD')        // 12345
```

### Investment Calculations
```typescript
// Calculate gains/losses
calculateUnrealizedGainLoss(qty, purchasePrice, currentPrice)

// Portfolio metrics
calculateAllocationPercentage(investmentValue, totalPortfolio)
calculateCAGR(beginValue, endValue, years)
calculateAnnualizedReturn(startValue, endValue, days)
```

### Loan Calculations
```typescript
// Amortization
generateAmortizationSchedule(principal, rate, months)
calculateLoanPayment(principal, rate, months)
calculateTotalInterest(payment, months, principal)

// Debt metrics
calculateDebtToIncomeRatio(monthlyDebt, monthlyIncome)
```

### Savings Calculations
```typescript
// Interest calculations
calculateSimpleInterest(principal, rate, days)
calculateCompoundInterest(principal, rate, periods, years)
calculateFDMaturityAmount(principal, rate, days)
calculateRDMaturityAmount(monthlyDeposit, rate, months)
```

### Budget & Expense Tracking
```typescript
// Budget metrics
calculateBudgetUsage(spent, budgetAmount)           // 0-100
calculateAverageSpending(expenses, months)
calculateSpendingTrend(currentMonth, previousMonth)
```

### Tax Calculations
```typescript
// Federal tax (US simplified)
calculateEstimatedTax(grossIncome, 'SINGLE')

// Capital gains
calculateCapitalGainsTax(gain, monthsHeld, 'SINGLE')
```

### Wealth Management
```typescript
calculateNetworth(assets, liabilities)
calculateSavingsRate(income, expenses)
calculateEmergencyFundMonths(fund, monthlyExpenses)
```

## Validation Schemas

All forms have Zod validation schemas in `src/lib/validation/financial.ts`:

### Insurance
```typescript
insurancePolicyFormSchema
insuranceClaimFormSchema
```

### Billing
```typescript
billPaymentFormSchema
billReminderFormSchema
autoBillPayFormSchema
```

### Investments
```typescript
investmentPurchaseFormSchema
investmentSellFormSchema
portfolioGoalFormSchema
```

### Loans
```typescript
loanApplicationFormSchema
loanPaymentFormSchema
loanPrepaymentFormSchema
```

### Savings
```typescript
fixedDepositFormSchema
recurringDepositFormSchema
```

### Budget & Expenses
```typescript
budgetFormSchema
expenseFormSchema
```

### Tax
```typescript
taxReportFormSchema
w2FormSchema
```

### Goals
```typescript
financialGoalFormSchema
```

## API Integration (To Implement)

Create `src/lib/api/financial.ts` with React Query hooks:

```typescript
// Insurance
useInsurancePolicies(userId)
useCreateInsurancePolicy(mutation)
useCreateInsuranceClaim(mutation)

// Bills
useBills(userId)
usePayBill(mutation)
useScheduleBillPayment(mutation)

// Investments
useInvestments(userId)
usePortfolioSummary(userId)
useBuyInvestment(mutation)
useSellInvestment(mutation)

// Loans
useLoans(userId)
useLoanPayments(mutation)
useLoanPrepayment(mutation)

// Savings
useSavingsAccounts(userId)
useCreateFixedDeposit(mutation)
useCreateRecurringDeposit(mutation)

// Budget
useBudgets(userId)
useExpenses(userId, filters)
useCreateExpense(mutation)

// Goals
useFinancialGoals(userId)
useCreateGoal(mutation)

// Tax
useTaxReports(userId)
useCreateTaxReport(mutation)

// Wealth
useNetworth(userId)
useFinancialMetrics(userId)
```

## Storybook Stories

Create story files for each component with multiple states:

```typescript
// InsurancePolicyCard.stories.tsx
export const Active = {
  args: { policy: mockActivePolicies[0] }
}

export const ExpiringSoon = {
  args: { policy: mockExpiringPolicies[0] }
}

export const Expired = {
  args: { policy: mockExpiredPolicies[0] }
}

export const Loading = {
  args: { isLoading: true }
}

export const Error = {
  args: { error: 'Failed to load policy' }
}
```

## Testing Strategy

### Unit Tests
- Individual component rendering
- Form validation with different inputs
- Utility function calculations

### Integration Tests
- Bill payment flow (select → pay → confirm)
- Loan payment with amortization recalculation
- Investment buy/sell with portfolio update
- Budget tracking across expense entry

### E2E Tests (Cypress)
- Complete insurance claim workflow
- Bill payment auto-setup
- Investment portfolio management
- Budget monitoring and alerts

## Data Formatting Rules

All financial amounts follow the smallest-unit integer pattern:

- USD/EUR: smallest unit = 1 cent = 100
- BTC/ETH: smallest unit = 1 satoshi/wei = 100,000,000
- Percentages: stored as decimals (5% = 5.0, not 0.05)

**Always convert on entry and exit:**
```typescript
// User enters: "123.45"
const smallest = toSmallestUnit(123.45, 'USD')  // 12345
// Store in database as: 12345

// Display to user:
const formatted = formatCurrencyAmount(12345, 'USD')  // "$123.45"
```

## Security Considerations

1. **No Sensitive Data in Frontend**
   - Bank account numbers (show last 4 digits only)
   - Social security numbers (masked)
   - Tax information (encrypted in transit)

2. **API Integration**
   - All financial transactions require 2FA
   - Sensitive operations need re-authentication
   - Audit logging for all financial activities

3. **Form Handling**
   - Client-side validation only for UX
   - Server-side validation for security
   - Rate limiting on transaction endpoints

4. **Data Privacy**
   - GDPR compliance for EU users
   - Encryption at rest for financial data
   - PCI DSS compliance for payment processing

## Performance Optimization

1. **Code Splitting**
   - Load financial modules on-demand
   - Lazy-load charts and heavy calculations

2. **Data Fetching**
   - Use React Query for caching
   - Paginate large lists (bills, transactions, expenses)
   - Debounce search and filter inputs

3. **Rendering**
   - Memoize expensive components
   - Virtualize long lists
   - Lazy-load images (biller logos)

## Accessibility Requirements

1. **Keyboard Navigation**
   - All forms accessible via keyboard
   - Tab order follows logical flow
   - Keyboard shortcuts for common actions

2. **Screen Readers**
   - Semantic HTML structure
   - ARIA labels for dynamic content
   - Announce status changes with aria-live

3. **Color Contrast**
   - WCAG AA minimum for all text
   - Don't rely on color alone for status
   - Use icons + text for important indicators

4. **Form Accessibility**
   - Clear labels for all inputs
   - Error messages associated with fields
   - Required field indicators

## Internationalization

Use `react-intl` for all user-facing strings:

```typescript
import { FormattedMessage, FormattedNumber, FormattedDate } from 'react-intl';

// Currency amounts
<FormattedNumber value={amount / 100} style="currency" currency="USD" />

// Dates
<FormattedDate value={date} year="numeric" month="short" day="numeric" />

// Messages
<FormattedMessage id="insurance.claim.submitted" />
```

## Roadmap

### Phase 1 (Current)
- ✅ Type definitions for all financial activities
- ✅ Utility functions and calculations
- ✅ Validation schemas
- ✅ Component stubs and basic implementations
- ✅ Enhanced Dashboard with all activity cards

### Phase 2
- Implement all component forms and workflows
- API integration with React Query
- Comprehensive test suite
- Storybook stories for all components

### Phase 3
- WebSocket integration for real-time financial data
- Advanced analytics and reporting
- PDF export for documents
- Mobile app optimization

### Phase 4
- AI-powered financial recommendations
- Automated investment portfolio rebalancing
- Tax optimization suggestions
- Wealth advisor chat integration

## Dependencies

Key packages to ensure are installed:
```json
{
  "react-hook-form": "^7.48.0",
  "zod": "^3.22.0",
  "@hookform/resolvers": "^3.3.0",
  "recharts": "^2.10.0",
  "date-fns": "^3.0.0",
  "react-intl": "^6.5.0",
  "@tanstack/react-query": "^5.0.0"
}
```

## Quick Start

1. **Add Financial Activity Page**
```typescript
// src/pages/financial/Insurance.tsx
import InsurancePolicies from '@/components/financial/insurance/InsurancePolicies';

export default function InsurancePage() {
  return <InsurancePolicies />;
}
```

2. **Connect to Navigation**
```typescript
// Update sidebar/navigation with new routes
const financialRoutes = [
  { path: '/financial/insurance', label: 'Insurance' },
  { path: '/financial/bills', label: 'Bills' },
  { path: '/financial/investments', label: 'Investments' },
  // ... etc
];
```

3. **Add to Enhanced Dashboard**
```typescript
// Dashboard already includes financial activity cards
// that navigate to detailed pages
```

## Support & Documentation

- Full type documentation in `src/types/financial/index.ts`
- Utility function docs in `src/lib/utils/financial.ts`
- Validation schema docs in `src/lib/validation/financial.ts`
- Component implementations with JSDoc comments

## Questions?

Refer to component PropTypes, utility function signatures, and validation schemas for detailed documentation of all available features.
