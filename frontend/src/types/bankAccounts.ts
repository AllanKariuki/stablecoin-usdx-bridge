export interface Bank {
  id: string;
  name: string;
  type: string;
  icon?: string;
  description?: string;
  isSupported: boolean;
  supportedActions?: string[];
}

export interface UserBankAccount {
  id: string;
  bankId: string;
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  balance?: number;
  type: string;
  isActive: boolean;
  isVerified?: boolean;
  linkedDate?: string;
  lastVerified?: string;
  connectionType?: 'manual' | 'linked';
}

export interface LinkedAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  accountType: string;
  linkedDate: string;
  lastVerified: string;
  isVerified: boolean;
}

export interface SavedBank {
  id: string;
  name: string;
  type: string;
  accountNumber: string;
  accountHolder: string;
  lastTransfer?: {
    amount: number;
    date: string;
  };
  isDefault?: boolean;
}

// Mock Data
export const MOCK_BANKS: Bank[] = [
  {
    id: 'b1',
    name: 'Kenya Commercial Bank',
    type: 'Tier 1 Bank',
    icon: '🏦',
    description: 'Major commercial bank with nationwide presence',
    isSupported: true,
    supportedActions: ['transfer', 'payment', 'withdrawal', 'deposit'],
  },
  {
    id: 'b2',
    name: 'Equity Bank',
    type: 'Tier 1 Bank',
    icon: '🏦',
    description: 'Digital banking services and solutions',
    isSupported: true,
    supportedActions: ['transfer', 'payment', 'withdrawal'],
  },
  {
    id: 'b3',
    name: 'Standard Chartered Bank',
    type: 'International Bank',
    icon: '🌍',
    description: 'Global banking and financial services',
    isSupported: true,
    supportedActions: ['transfer', 'payment'],
  },
  {
    id: 'b4',
    name: 'NCBA Bank',
    type: 'Tier 1 Bank',
    icon: '🏦',
    description: 'National bank with digital capabilities',
    isSupported: true,
    supportedActions: ['transfer', 'withdrawal', 'deposit'],
  },
  {
    id: 'b5',
    name: 'Absa Bank',
    type: 'Tier 1 Bank',
    icon: '🏦',
    description: 'African banking services',
    isSupported: false,
    supportedActions: [],
  },
  {
    id: 'b6',
    name: 'Barclays Bank Kenya',
    type: 'International Bank',
    icon: '🌍',
    description: 'International banking and investment services',
    isSupported: false,
    supportedActions: [],
  },
];

export const MOCK_USER_BANK_ACCOUNTS: UserBankAccount[] = [
  {
    id: 'uba1',
    bankId: 'b1',
    bankName: 'Kenya Commercial Bank',
    accountNumber: '0123456789',
    accountHolder: 'John Doe',
    balance: 125000,
    type: 'Savings Account',
    isActive: true,
    isVerified: true,
    linkedDate: '2024-11-15T10:00:00Z',
    lastVerified: '2025-01-20T09:30:00Z',
    connectionType: 'manual',
  },
  {
    id: 'uba2',
    bankId: 'b2',
    bankName: 'Equity Bank',
    accountNumber: '9876543210',
    accountHolder: 'John Doe',
    balance: 85000,
    type: 'Current Account',
    isActive: true,
    isVerified: true,
    linkedDate: '2024-12-01T10:00:00Z',
    lastVerified: '2025-01-20T09:30:00Z',
    connectionType: 'linked',
  },
];

export const MOCK_LINKED_ACCOUNTS: LinkedAccount[] = [
  {
    id: 'l1',
    bankName: 'Equity Bank',
    accountNumber: '9876543210',
    accountType: 'Savings Account',
    linkedDate: '2024-12-01T10:00:00Z',
    lastVerified: '2025-01-20T09:30:00Z',
    isVerified: true,
  },
];

export const MOCK_SAVED_BANKS: SavedBank[] = [
  {
    id: 'b1',
    name: 'Kenya Commercial Bank',
    type: 'Tier 1 Bank',
    accountNumber: '0123456789',
    accountHolder: 'John Doe',
    lastTransfer: { amount: 50000, date: '2025-01-15T14:30:00Z' },
    isDefault: true,
  },
];
