/**
 * Financial Components Barrel Export
 * 
 * Central export file for all financial components
 * Makes it easier to import components across the application
 * 
 * Usage:
 * import { InsurancePolicyCard, BillPaymentCard, InvestmentCard, LoanCard } from '@/components/financial';
 */

// Insurance Components
export { default as InsurancePolicyCard } from './insurance/InsurancePolicyCard';

// Payment Components
export { default as BillPaymentCard } from './payments/BillPaymentCard';

// Investment Components
export { default as InvestmentCard } from './investments/InvestmentCard';

// Loan Components
export { default as LoanCard } from './loans/LoanCard';

// TODO: Export components as they are implemented

// Savings Components
// export { default as SavingsAccountCard } from './savings/SavingsAccountCard';
// export { default as FixedDepositForm } from './savings/FixedDepositForm';
// export { default as RecurringDepositForm } from './savings/RecurringDepositForm';

// Budget Components
// export { default as BudgetCard } from './budget/BudgetCard';
// export { default as BudgetForm } from './budget/BudgetForm';
// export { default as ExpenseForm } from './budget/ExpenseForm';
// export { default as ExpensesList } from './budget/ExpensesList';

// Goals Components
// export { default as GoalCard } from './goals/GoalCard';
// export { default as GoalForm } from './goals/GoalForm';
// export { default as GoalsList } from './goals/GoalsList';

// Tax Components
// export { default as TaxReportCard } from './tax/TaxReportCard';
// export { default as TaxDocumentUploadForm } from './tax/TaxDocumentUploadForm';

// Wealth Components
// export { default as NetworthCard } from './wealth/NetworthCard';
// export { default as FinancialMetricsDashboard } from './wealth/FinancialMetricsDashboard';

// Rewards Components
// export { default as RewardsOverviewCard } from './rewards/RewardsOverviewCard';
// export { default as RewardsList } from './rewards/RewardsList';

// Common Components
// export { default as CurrencyInput } from './common/CurrencyInput';
// export { default as DateRangePicker } from './common/DateRangePicker';
// export { default as TransactionTable } from './common/TransactionTable';
// export { default as StatusBadge } from './common/StatusBadge';
