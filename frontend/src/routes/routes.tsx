import { lazy } from 'react'

// Lazy load components
const LandingPage = lazy(() => import('../pages/Oauth/LandingPage'));
const Login = lazy(() => import('../pages/Oauth/Login'));
const Dashboard = lazy(() => import('../pages/Dashboard'));
const EnhancedDashboard = lazy(() => import('../pages/EnhancedDashboard'));

// Wallet pages
const WalletOverview = lazy(() => import('../pages/wallet/WalletOverview'));
const AddWallet = lazy(() => import('../pages/wallet/WalletAdd'));

// Transaction pages
const DepositCreate = lazy(() => import('../pages/transactions/DepositsCreate'));
const DepositHistory = lazy(() => import('../pages/transactions/DepositsHistory'));
const WithdrawalsCreate = lazy(() => import('../pages/transactions/WithdrawalsCreate'));
const WithdrawalsHistory = lazy(() => import('../pages/transactions/WithdrawalsHistory'));
const TransactionsList = lazy(() => import('../pages/transactions/TransactionsList'));
// const TransfersCreate = lazy(() => import('../pages/transactions/TransfersCreate'));
// const TransfersHistory = lazy(() => import('../pages/transactions/TransfersHistory'));

// Payment pages
const SendPayment = lazy(() => import('../pages/payments/SendMoney'));
const ReceivePayment = lazy(() => import('../pages/payments/Receive'));
const RequestPayment = lazy(() => import('../pages/payments/Request'));
const PayBills = lazy(() => import('../pages/payments/PayBills'));
const PaymentHistory = lazy(() => import('../pages/payments/PaymentHistory'));
const Merchants = lazy(() => import('../pages/payments/merchant-vendors/Merchants'));
const ScheduledPayments = lazy(() => import('../pages/payments/Scheduled'));

const BanksInstitutions = lazy(() => import('../pages/payments/banks-institutions/BanksInstitutions'));

// Online Services pages
const OnlineSubscriptions = lazy(() => import('../pages/payments/online/Subscriptions'));
const OnlineStreaming = lazy(() => import('../pages/payments/online/Streaming'));
const OnlineShopping = lazy(() => import('../pages/payments/online/Shopping'));

// POS Payments pages
const POSPayments = lazy(() => import('../pages/payments/pos/POSPayments'));
const ScanQRCode = lazy(() => import('../pages/payments/pos/ScanQRCode'));
const GenerateQRCode = lazy(() => import('../pages/payments/pos/GenerateQRCode'));
const TapToPay = lazy(() => import('../pages/payments/pos/TapToPay'));

// Financial Pages
const InsurancePage = lazy(() => import('../pages/financial/InsurancePage'));
const BillsPage = lazy(() => import('../pages/financial/BillsPage'));
const InvestmentsPage = lazy(() => import('../pages/financial/InvestmentsPage'));
const LoansPage = lazy(() => import('../pages/financial/LoansPage'));
const SavingsPage = lazy(() => import('../pages/financial/SavingsPage'));
const BudgetPage = lazy(() => import('../pages/financial/BudgetPage'));
const GoalsPage = lazy(() => import('../pages/financial/GoalsPage'));

// Financial Planning Pages
// const FinancialPlanningOverview = lazy(() => import('../pages/financial-planning/Overview'));
// const FinancialPlanningBudget = lazy(() => import('../pages/financial-planning/Budget'));
// const FinancialPlanningSavings = lazy(() => import('../pages/financial-planning/Savings'));
// const FinancialPlanningGoals = lazy(() => import('../pages/financial-planning/Goals'));
// const FinancialPlanningInsights = lazy(() => import('../pages/financial-planning/Insights'));

// Investments Pages
const InvestmentsPortfolio = lazy(() => import('../pages/investments/Portfolio'));
const InvestmentsStocks = lazy(() => import('../pages/investments/Stocks'));
const InvestmentsBonds = lazy(() => import('../pages/investments/Bonds'));
const InvestmentsMutualFunds = lazy(() => import('../pages/investments/MutualFunds'));
const InvestmentsCrypto = lazy(() => import('../pages/investments/Crypto'));
const InvestmentsPerformance = lazy(() => import('../pages/investments/Performance'));

// Insurance Pages
// const InsurancePolicies = lazy(() => import('../pages/insurance/Policies'));
// const InsuranceBuy = lazy(() => import('../pages/insurance/Buy'));
// const InsuranceClaims = lazy(() => import('../pages/insurance/Claims'));
// const InsuranceClaimStatus = lazy(() => import('../pages/insurance/ClaimStatus'));

// Loans Pages
// const LoansApply = lazy(() => import('../pages/loans/ApplyLoan'));
// const LoansMyLoans = lazy(() => import('../pages/loans/MyLoans'));
// const LoansHistory = lazy(() => import('../pages/loans/History'));
// const LoansCreditScore = lazy(() => import('../pages/loans/CreditScore'));
// const LoansRepayment = lazy(() => import('../pages/loans/Repayment'));

// Accounts Pages
// const AccountSettings = lazy(() => import('../pages/accounts/AccountSettings'));
// const AccountSecurity = lazy(() => import('../pages/accounts/Security'));
// const AccountPaymentMethods = lazy(() => import('../pages/accounts/PaymentMethods'));
// const AccountNotifications = lazy(() => import('../pages/accounts/Notifications'));
// const AccountPreferences = lazy(() => import('../pages/accounts/Preferences'));

// KYC & Verification Pages
const KYCProfile = lazy(() => import('../pages/kyc/Profile'));
const KYCUpload = lazy(() => import('../pages/kyc/Upload'));
const KYCVerification = lazy(() => import('../pages/kyc/Verification'));

// Trading Pages
const TradingOrders = lazy(() => import('../pages/trading/Orders'));
const TradingHistory = lazy(() => import('../pages/trading/History'));
const TradingPortfolio = lazy(() => import('../pages/trading/Portfolio'));
const TradingConversions = lazy(() => import('../pages/trading/Conversions'));
const TradingTrades = lazy(() => import('../pages/trading/Trades'));
const CryptoDetails = lazy(() => import('../pages/trading/CryptoDetails'));

// Conversion Pages (Currency Exchange)
// const Convert = lazy(() => import('../pages/conversion/Convert'));
const ConvertQuote = lazy(() => import('../pages/conversion/ConvertQuote'));
const ConvertConfirm = lazy(() => import('../pages/conversion/ConvertConfirm'));
const ConvertHistory = lazy(() => import('../pages/conversion/ConvertHistory'));
const ConvertWallets = lazy(() => import('../pages/conversion/ConvertWallets'));
const ConvertRedux = lazy(() => import('../pages/conversion/ConvertRedux'));

// Support Pages
const HelpCenter = lazy(() => import('../pages/support/HelpCenter'));
const SupportFAQ = lazy(() => import('../pages/support/FAQ'));
const ContactSupport = lazy(() => import('../pages/support/Contact'));
const SupportTickets = lazy(() => import('../pages/support/Tickets'));
const SupportHelp = lazy(() => import('../pages/support/Help'));

// Component mapping - this can be extended as needed
export const componentMap = {
    // Special routes
    '/': LandingPage,
    '/login': Login,
    '/dashboard': Dashboard,
    '/enhanced-dashboard': EnhancedDashboard,

    // Wallet routes
    '/wallet/overview': WalletOverview,
    '/wallet/add-wallet': AddWallet,
    '/wallet/deposits/create': DepositCreate,
    '/wallet/deposits/history': DepositHistory,
    '/wallet/withdrawals/create': WithdrawalsCreate,
    '/wallet/withdrawals/history': WithdrawalsHistory,
    '/wallet/banks-institutions': BanksInstitutions,
    '/wallet/transactions': TransactionsList,


    // Payment routes
    '/payments/send': SendPayment,
    '/payments/receive': ReceivePayment,
    '/payments/request': RequestPayment,
    '/payments/bills': PayBills,
    '/payments/bills/electricity': PayBills,
    '/payments/bills/water': PayBills,
    '/payments/bills/internet': PayBills,
    '/payments/bills/mobile': PayBills,
    '/payments/bills/gas': PayBills,
    '/payments/bills/other': PayBills,

    // '/payments/vendors/saved': ,
    // '/payments/vendors/pay': ,
    // '/payments/vendors/history': ,
    // '/payments/institutions/bank-transfer': ,
    // '/payments/institutions/mobile-money': ,
    // '/payments/institutions/linked': ,

    // '/payments/online/subscriptions': ,
    // '/payments/online/shopping': ,
    // '/payments/online/streaming': ,

    // '/payments/pos/scan': ,
    // '/payments/pos/my-qr': ,
    // '/payments/pos/nfc': ,

    '/payments/scheduled': ScheduledPayments,
    '/payments/history': PaymentHistory,
    
    '/payments/vendors': Merchants,
    '/payments/vendors/saved': Merchants,
    '/payments/vendors/pay': Merchants,
    '/payments/vendors/history': Merchants,

    // Online Services routes
    '/payments/online/subscriptions': OnlineSubscriptions,
    '/payments/online/streaming': OnlineStreaming,
    '/payments/online/shopping': OnlineShopping,

    // POS Payments routes
    '/payments/pos': POSPayments,
    '/payments/pos/scan': ScanQRCode,
    '/payments/pos/my-qr': GenerateQRCode,
    '/payments/pos/nfc': TapToPay,

    // Trading and orders routes
    '/trading/orders/active': TradingOrders,
    '/trading/orders/history': TradingHistory,
    // '/trading/markets': ,
    // '/trading/watchlist': ,
    '/trading/portfolio': TradingPortfolio,
    '/trading/conversions': TradingConversions,
    '/trading/trades': TradingTrades,
    '/trading/crypto/details': CryptoDetails,

    // Conversion (Currency Exchange) routes
    // '/convert': Convert,
    '/convert/quote/:quoteId': ConvertQuote,
    '/convert/confirm/:txId': ConvertConfirm,
    '/convert/history': ConvertHistory,
    '/convert/wallets': ConvertWallets,
    '/convert': ConvertRedux,


    // Financial planning
    // '/financial-planning/overview': FinancialPlanningOverview,
    // '/financial-planning/budget': FinancialPlanningBudget,
    // '/financial-planning/savings': FinancialPlanningSavings,
    // '/financial-planning/goals': FinancialPlanningGoals,
    // '/financial-planning/insights': FinancialPlanningInsights,

    // Investments routes
    '/investments/portfolio': InvestmentsPortfolio,
    '/investments/stocks': InvestmentsStocks,
    '/investments/bonds': InvestmentsBonds,
    '/investments/mutual-funds': InvestmentsMutualFunds,
    '/investments/crypto': InvestmentsCrypto,
    '/investments/performance': InvestmentsPerformance,


    // Credit and loans routes
    // '/loans/apply': LoansApply,
    // '/loans/my-loans': LoansMyLoans,
    // '/loans/history': LoansHistory,
    // '/loans/credit-score': LoansCreditScore,
    // '/loans/repayment': LoansRepayment,

    // Insurance routes
    // '/insurance/policies': InsurancePolicies,
    // '/insurance/claims': InsuranceClaims,
    // '/insurance/claim-status': InsuranceClaimStatus,
    // '/insurance/buy': InsuranceBuy,

    // Financial routes
    '/financial/insurance': InsurancePage,
    '/financial/bills': BillsPage,
    '/financial/investments': InvestmentsPage,
    '/financial/loans': LoansPage,
    '/financial/savings': SavingsPage,
    '/financial/budget': BudgetPage,
    '/financial/goals': GoalsPage,

    // KYC & Verification routes
    '/kyc/profile': KYCProfile,
    '/kyc/upload': KYCUpload,
    '/kyc/status': KYCVerification,

    // Settings routes
    // '/settings/account': AccountSettings,
    // '/settings/security': AccountSecurity,
    // '/settings/notifications': AccountNotifications,
    // '/settings/payment-methods': AccountPaymentMethods,
    // '/settings/preferences': AccountPreferences,

    // Support routes
    '/support/help': SupportHelp,
    '/support/help-center': HelpCenter,
    '/support/faq': SupportFAQ,
    '/support/contact': ContactSupport,
    '/support/tickets': SupportTickets,

} as const;
