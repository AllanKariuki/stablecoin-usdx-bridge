export interface MenuItem {
    id: string;
    label: string;
    icon?: string;
    path?: string;
    children?: MenuItem[];
    isHighlighted?: boolean;
    isActive?: boolean;
    onClick?: () => void;
}

export interface SidebarProps {
    menuItems: MenuItem[];
    onMenuItemClick?: (item: MenuItem) => void;
    activeItemId?: string;
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
    isLoading?: boolean;
}

export interface SidebarState {
  menuItems: MenuItem[];
  loading: boolean;
  error: string | null;
  activeItemId: string;
  isCollapsed: boolean;
}

// export const menuPayload: MenuItem[] = [
//   {
//     id: 'dashboard',
//     label: 'Dashboard',
//     icon: 'LayoutDashboard',
//     path: '/dashboard'
//   },
  
//   // WALLET & ACCOUNTS SECTION
//   {
//     id: 'wallet',
//     label: 'Wallet',
//     icon: 'Wallet',
//     path: '/wallet',
//     children: [
//       {
//         id: 'overview',
//         label: 'Overview',
//         path: '/wallet/overview'
//       },
//       {
//         id: 'add-wallet',
//         label: 'Add Wallet',
//         path: '/wallet/add-wallet'
//       }
//     ]
//   },
  
//   // TRANSACTIONS SECTION
//   {
//     id: 'transactions',
//     label: 'Transactions',
//     icon: 'ArrowLeftRight',
//     path: '/transactions',
//     children: [
//       {
//         id: 'deposits',
//         label: 'Deposits',
//         icon: 'BanknoteArrowDown',
//         path: '/transactions/deposits',
//         children: [
//           {
//             id: 'create-deposit',
//             label: 'Make Deposit',
//             path: '/transactions/deposits/create'
//           },
//           {
//             id: 'deposit-history',
//             label: 'Deposit History',
//             path: '/transactions/deposits/history'
//           },
//           // {
//           //   id: 'deposit-status',
//           //   label: 'Deposit Status',
//           //   path: '/transactions/deposits/status'
//           // }
//         ]
//       },
//       {
//         id: 'withdrawals',
//         label: 'Withdrawals',
//         icon: 'BanknoteArrowUp',
//         path: '/transactions/withdrawals',
//         children: [
//           {
//             id: 'create-withdrawal',
//             label: 'Make Withdrawal',
//             path: '/transactions/withdrawals/create'
//           },
//           {
//             id: 'withdrawal-history',
//             label: 'Withdrawal History',
//             path: '/transactions/withdrawals/history'
//           },
//           // {
//           //   id: 'withdrawal-status',
//           //   label: 'Withdrawal Status',
//           //   path: '/transactions/withdrawals/status'
//           // }
//         ]
//       },
//       {
//         id: 'transaction-history',
//         label: 'All Transactions',
//         path: '/transactions/history'
//       }
//     ]
//   },

//   // CURRENCY CONVERSION SECTION
//   {
//     id: 'convert',
//     label: 'Currency Conversion',
//     icon: 'RefreshCw',
//     path: '/convert',
//     children: [
//       {
//         id: 'convert-new',
//         label: 'New Conversion',
//         path: '/convert'
//       },
//       {
//         id: 'convert-history',
//         label: 'History',
//         path: '/convert/history'
//       },
//       {
//         id: 'convert-wallets',
//         label: 'Wallets',
//         path: '/convert/wallets'
//       }
//     ]
//   },
  
//   // PAYMENTS SECTION (End-User Focused)
//   {
//     id: 'payments',
//     label: 'Payments',
//     icon: 'CreditCard',
//     path: '/payments',
//     children: [
//       {
//         id: 'send-payment',
//         label: 'Send Money',
//         path: '/payments/send'
//       },
//       {
//         id: 'receive-payment',
//         label: 'Receive Money',
//         path: '/payments/receive'
//       },
//       {
//         id: 'request-payment',
//         label: 'Request Payment',
//         path: '/payments/request'
//       },
//       {
//         id: 'bills',
//         label: 'Pay Bills',
//         path: '/payments/bills'
//       },
//       // {
//       //   id: 'bills',
//       //   label: 'Pay Bills',
//       //   icon: 'FileText',
//       //   path: '/payments/bills',
//       //   children: [
//       //     {
//       //       id: 'electricity',
//       //       label: 'Electricity',
//       //       path: '/payments/bills/electricity'
//       //     },
//       //     {
//       //       id: 'water',
//       //       label: 'Water',
//       //       path: '/payments/bills/water'
//       //     },
//       //     {
//       //       id: 'internet',
//       //       label: 'Internet & TV',
//       //       path: '/payments/bills/internet'
//       //     },
//       //     {
//       //       id: 'mobile',
//       //       label: 'Mobile Airtime',
//       //       path: '/payments/bills/mobile'
//       //     },
//       //     {
//       //       id: 'gas',
//       //       label: 'Gas',
//       //       path: '/payments/bills/gas'
//       //     },
//       //     {
//       //       id: 'other-bills',
//       //       label: 'Other Bills',
//       //       path: '/payments/bills/other'
//       //     }
//       //   ]
//       // },
//       {
//         id: 'vendors',
//         label: 'Merchants & Vendors',
//         path: '/payments/vendors',
//       },
//       // {
//       //   id: 'vendors',
//       //   label: 'Merchants & Vendors',
//       //   icon: 'Store',
//       //   path: '/payments/vendors',
//       //   children: [
//       //     {
//       //       id: 'saved-vendors',
//       //       label: 'Saved Merchants',
//       //       path: '/payments/vendors/saved'
//       //     },
//       //     {
//       //       id: 'pay-vendor',
//       //       label: 'Pay Merchant',
//       //       path: '/payments/vendors/pay'
//       //     },
//       //     {
//       //       id: 'vendor-history',
//       //       label: 'Payment History',
//       //       path: '/payments/vendors/history'
//       //     }
//       //   ]
//       // },
//       // {
//       //   id: 'banks-institutions',
//       //   label: 'Banks & Institutions',
//       //   icon: 'Building2',
//       //   path: '/payments/banks-institutions',
//       //   children: [
//       //     {
//       //       id: 'view-all-banks',
//       //       label: 'View All',
//       //       path: '/payments/banks-institutions'
//       //     },
//       //     {
//       //       id: 'saved-banks',
//       //       label: 'Saved Banks',
//       //       path: '/payments/banks-institutions'
//       //     },
//       //     {
//       //       id: 'available-banks',
//       //       label: 'Available Banks',
//       //       path: '/payments/banks-institutions'
//       //     },
//       //     {
//       //       id: 'linked-accounts',
//       //       label: 'Linked Accounts',
//       //       path: '/payments/banks-institutions'
//       //     },
//       //     {
//       //       id: 'mobile-money',
//       //       label: 'Mobile Money',
//       //       path: '/payments/banks-institutions'
//       //     }
//       //   ]
//       // },
//       {
//         id: 'banks-institutions',
//         label: 'Banks & Institutions',
//         path: '/payments/banks-institutions',
//       },
//       {
//         id: 'online-services',
//         label: 'Online Services',
//         icon: 'Globe',
//         path: '/payments/online',
//         children: [
//           {
//             id: 'subscriptions',
//             label: 'Subscriptions',
//             path: '/payments/online/subscriptions'
//           },
//           {
//             id: 'streaming',
//             label: 'Streaming Services',
//             path: '/payments/online/streaming'
//           },
//           {
//             id: 'shopping',
//             label: 'Online Shopping',
//             path: '/payments/online/shopping'
//           }
//         ]
//       },
//       {
//         id: 'pos-payments',
//         label: 'In-Store Payments',
//         icon: 'Smartphone',
//         path: '/payments/pos',
//         children: [
//           {
//             id: 'scan-to-pay',
//             label: 'Scan QR Code',
//             path: '/payments/pos/scan'
//           },
//           {
//             id: 'generate-qr',
//             label: 'My QR Code',
//             path: '/payments/pos/my-qr'
//           },
//           {
//             id: 'tap-to-pay',
//             label: 'Tap to Pay (NFC)',
//             path: '/payments/pos/nfc'
//           }
//         ]
//       },
//       {
//         id: 'scheduled-payments',
//         label: 'Scheduled Payments',
//         path: '/payments/scheduled'
//       },
//       {
//         id: 'payment-history',
//         label: 'Payment History',
//         path: '/payments/history'
//       }
//     ]
//   },
  
//   // TRADING & ORDERS SECTION
//   {
//     id: 'trading',
//     label: 'Trading',
//     icon: 'LineChart',
//     path: '/trading',
//     children: [
//       {
//         id: 'active-orders',
//         label: 'Active Orders',
//         path: '/trading/orders/active'
//       },
//       {
//         id: 'order-history',
//         label: 'Order History',
//         path: '/trading/orders/history'
//       },
//       {
//         id: 'trade-history',
//         label: 'Trade History',
//         path: '/trading/trades'
//       }
//     ]
//   },
  
//   // FINANCIAL PLANNING SECTION
//   {
//     id: 'financial-planning',
//     label: 'Financial Planning',
//     icon: 'PieChart',
//     path: '/financial-planning',
//     children: [
//       {
//         id: 'overview',
//         label: 'Overview',
//         path: '/financial-planning/overview'
//       },
//       {
//         id: 'budget',
//         label: 'Budget & Expenses',
//         icon: 'BarChart',
//         path: '/financial-planning/budget'
//       },
//       {
//         id: 'savings',
//         label: 'Savings Plans',
//         icon: 'PiggyBank',
//         path: '/financial-planning/savings'
//       },
//       {
//         id: 'goals',
//         label: 'Financial Goals',
//         icon: 'Target',
//         path: '/financial-planning/goals'
//       },
//       {
//         id: 'insights',
//         label: 'Spending Insights',
//         path: '/financial-planning/insights'
//       }
//     ]
//   },
  
//   // INVESTMENTS SECTION
//   {
//     id: 'investments',
//     label: 'Investments',
//     icon: 'TrendingUp',
//     path: '/investments',
//     children: [
//       {
//         id: 'portfolio',
//         label: 'My Portfolio',
//         path: '/investments/portfolio'
//       },
//       {
//         id: 'stocks',
//         label: 'Stocks',
//         path: '/investments/stocks'
//       },
//       {
//         id: 'bonds',
//         label: 'Bonds',
//         path: '/investments/bonds'
//       },
//       {
//         id: 'mutual-funds',
//         label: 'Mutual Funds',
//         path: '/investments/mutual-funds'
//       },
//       {
//         id: 'crypto',
//         label: 'Cryptocurrency',
//         path: '/investments/crypto'
//       },
//       {
//         id: 'performance',
//         label: 'Performance',
//         path: '/investments/performance'
//       }
//     ]
//   },
  
//   // CREDIT & LOANS SECTION
//   {
//     id: 'loans',
//     label: 'Loans & Credit',
//     icon: 'CircleDollarSignIcon',
//     path: '/loans',
//     children: [
//       {
//         id: 'apply-loan',
//         label: 'Apply for Loan',
//         path: '/loans/apply'
//       },
//       {
//         id: 'my-loans',
//         label: 'My Loans',
//         path: '/loans/my-loans'
//       },
//       {
//         id: 'loan-history',
//         label: 'Loan History',
//         path: '/loans/history'
//       },
//       {
//         id: 'credit-score',
//         label: 'Credit Score',
//         path: '/loans/credit-score'
//       },
//       {
//         id: 'repayment',
//         label: 'Repayment Schedule',
//         path: '/loans/repayment'
//       }
//     ]
//   },
  
//   // INSURANCE SECTION
//   {
//     id: 'insurance',
//     label: 'Insurance',
//     icon: 'ShieldCheck',
//     path: '/insurance',
//     children: [
//       {
//         id: 'policies',
//         label: 'My Policies',
//         path: '/insurance/policies'
//       },
//       {
//         id: 'buy-insurance',
//         label: 'Buy Insurance',
//         path: '/insurance/buy'
//       },
//       {
//         id: 'claims',
//         label: 'File a Claim',
//         path: '/insurance/claims'
//       },
//       {
//         id: 'claim-status',
//         label: 'Claim Status',
//         path: '/insurance/claim-status'
//       }
//     ]
//   },
  
//   // ACCOUNT & VERIFICATION
//   {
//     id: 'kyc',
//     label: 'Account Verification',
//     icon: 'UserCheck',
//     path: '/kyc',
//     children: [
//       {
//         id: 'profile',
//         label: 'My Profile',
//         path: '/kyc/profile'
//       },
//       {
//         id: 'upload-documents',
//         label: 'Upload Documents',
//         path: '/kyc/upload'
//       },
//       {
//         id: 'verification-status',
//         label: 'Verification Status',
//         path: '/kyc/status'
//       }
//     ]
//   },
  
//   // SETTINGS
//   {
//     id: 'settings',
//     label: 'Settings',
//     icon: 'Settings',
//     path: '/settings',
//     children: [
//       {
//         id: 'account-settings',
//         label: 'Account Settings',
//         path: '/settings/account'
//       },
//       {
//         id: 'security',
//         label: 'Security & Privacy',
//         path: '/settings/security'
//       },
//       {
//         id: 'payment-methods',
//         label: 'Payment Methods',
//         path: '/settings/payment-methods'
//       },
//       {
//         id: 'notifications',
//         label: 'Notifications',
//         path: '/settings/notifications'
//       },
//       {
//         id: 'preferences',
//         label: 'Preferences',
//         path: '/settings/preferences'
//       }
//     ]
//   },
  
//   // SUPPORT
//   {
//     id: 'support',
//     label: 'Help & Support',
//     icon: 'HelpCircle',
//     path: '/support',
//     children: [
//       {
//         id: 'help-center',
//         label: 'Help Center',
//         path: '/support/help'
//       },
//       {
//         id: 'faq',
//         label: 'FAQs',
//         path: '/support/faq'
//       },
//       {
//         id: 'contact',
//         label: 'Contact Support',
//         path: '/support/contact'
//       },
//       {
//         id: 'my-tickets',
//         label: 'My Support Tickets',
//         path: '/support/tickets'
//       }
//     ]
//   }
// ];

export const menuPayload: MenuItem[] = [
  // DASHBOARD
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: 'LayoutDashboard',
    path: '/dashboard'
  },
  
  // WALLET & ACCOUNTS SECTION (Now includes all wallet operations)
  {
    id: 'wallet',
    label: 'Wallet',
    icon: 'Wallet',
    path: '/wallet',
    children: [
      {
        id: 'overview',
        label: 'Overview',
        path: '/wallet/overview'
      },
      {
        id: 'add-wallet',
        label: 'Add Wallet',
        path: '/wallet/add-wallet'
      },
      {
        id: 'banks-institutions',
        label: 'Banks & Institutions',
        path: '/wallet/banks-institutions'
      },
      {
        id: 'create-deposit',
        label: 'Make Deposit',
        path: '/wallet/deposits/create'
      },
      {
        id: 'create-withdrawal',
        label: 'Make Withdrawal',
        path: '/wallet/withdrawals/create'
      },
      {
        id: 'deposit-history',
        label: 'Deposit History',
        path: '/wallet/deposits/history'
      },
      {
        id: 'withdrawal-history',
        label: 'Withdrawal History',
        path: '/wallet/withdrawals/history'
      },
      {
        id: 'transaction-history',
        label: 'Transaction History',
        path: '/wallet/transactions'
      }
    ]
  },

  // CURRENCY CONVERSION SECTION
  {
    id: 'convert',
    label: 'Currency Conversion',
    icon: 'RefreshCw',
    path: '/convert',
    children: [
      {
        id: 'convert-new',
        label: 'New Conversion',
        path: '/convert'
      },
      {
        id: 'convert-history',
        label: 'Conversion History',
        path: '/convert/history'
      },
      {
        id: 'convert-wallets',
        label: 'Wallet Balances',
        path: '/convert/wallets'
      }
    ]
  },
  
  // PAYMENTS SECTION (External transactions - send/receive money)
  {
    id: 'payments',
    label: 'Payments',
    icon: 'CreditCard',
    path: '/payments',
    children: [
      {
        id: 'send-payment',
        label: 'Send Money',
        path: '/payments/send'
      },
      {
        id: 'receive-payment',
        label: 'Receive Money',
        path: '/payments/receive'
      },
      {
        id: 'request-payment',
        label: 'Request Payment',
        path: '/payments/request'
      },
      {
        id: 'bills',
        label: 'Pay Bills',
        path: '/payments/bills'
      },
      {
        id: 'vendors',
        label: 'Merchants & Vendors',
        path: '/payments/vendors'
      },
      {
        id: 'pos-payments',
        label: 'In-Store Payments',
        // icon: 'Smartphone',
        path: '/payments/pos',
      },
      // {
      //   id: 'pos-payments',
      //   label: 'In-Store Payments',
      //   icon: 'Smartphone',
      //   path: '/payments/pos',
      //   children: [
      //     {
      //       id: 'scan-to-pay',
      //       label: 'Scan QR Code',
      //       path: '/payments/pos/scan'
      //     },
      //     {
      //       id: 'generate-qr',
      //       label: 'My QR Code',
      //       path: '/payments/pos/my-qr'
      //     },
      //     {
      //       id: 'tap-to-pay',
      //       label: 'Tap to Pay (NFC)',
      //       path: '/payments/pos/nfc'
      //     }
      //   ]
      // },
      {
        id: 'scheduled-payments',
        label: 'Scheduled Payments',
        path: '/payments/scheduled'
      },
      {
        id: 'payment-history',
        label: 'Payment History',
        path: '/payments/history'
      }
    ]
  },

  // ACCOUNT & VERIFICATION
  {
    id: 'kyc',
    label: 'Account Verification',
    icon: 'UserCheck',
    path: '/kyc',
    children: [
      {
        id: 'profile',
        label: 'My Profile',
        path: '/kyc/profile'
      },
      {
        id: 'upload-documents',
        label: 'Upload Documents',
        path: '/kyc/upload'
      },
      {
        id: 'verification-status',
        label: 'Verification Status',
        path: '/kyc/status'
      }
    ]
  },
  
  // SETTINGS
  {
    id: 'settings',
    label: 'Settings',
    icon: 'Settings',
    path: '/settings',
    children: [
      {
        id: 'account-settings',
        label: 'Account Settings',
        path: '/settings/account'
      },
      {
        id: 'security',
        label: 'Security & Privacy',
        path: '/settings/security'
      },
      {
        id: 'payment-methods',
        label: 'Payment Methods',
        path: '/settings/payment-methods'
      },
      {
        id: 'notifications',
        label: 'Notifications',
        path: '/settings/notifications'
      },
      {
        id: 'preferences',
        label: 'Preferences',
        path: '/settings/preferences'
      }
    ]
  },
  
  // SUPPORT
  {
    id: 'support',
    label: 'Help & Support',
    icon: 'HelpCircle',
    path: '/support',
    children: [
      {
        id: 'help-center',
        label: 'Help Center',
        path: '/support/help'
      },
      {
        id: 'faq',
        label: 'FAQs',
        path: '/support/faq'
      },
      {
        id: 'contact',
        label: 'Contact Support',
        path: '/support/contact'
      },
      {
        id: 'my-tickets',
        label: 'My Support Tickets',
        path: '/support/tickets'
      }
    ]
  }
]