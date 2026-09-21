import type { TransactionHistory } from "../financial";

export interface TransactionsState {
  transactions: TransactionHistory[];
  filteredTransactions: TransactionHistory[];
  selectedTransaction: TransactionHistory | null;
  filters: {
    type?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    minAmount?: number;
    maxAmount?: number;
  };
  searchTerm: string;
  loading: boolean;
  error: string | null;
  currentPage: number;
  itemsPerPage: number;
  totalCount: number;
}

export const mockTransactions: TransactionHistory[] = [
  {
    id: '#1',
    userId: 'user-1',
    type: 'payment_sent',
    amount: 55.953,
    currency: 'BTC',
    status: 'completed',
    description: 'Lorem ipsum dol...',
    reference: '#1245346563475',
    counterpartyName: 'Harry',
    fees: 0,
    createdAt: new Date('2025-02-05').toISOString(),
  },
  {
    id: '#2',
    userId: 'user-1',
    type: 'payment_received',
    amount: 120.50,
    currency: 'ETH',
    status: 'completed',
    description: 'Payment received from client',
    reference: '#1245346563476',
    counterpartyName: 'Alice',
    fees: 2.5,
    createdAt: new Date('2025-02-06').toISOString(),
  },
  {
    id: '#3',
    userId: 'user-1',
    type: 'deposit',
    amount: 1000.00,
    currency: 'USD',
    status: 'pending',
    description: 'Bank deposit',
    reference: '#1245346563477',
    counterpartyName: 'Bank Transfer',
    fees: 0,
    createdAt: new Date('2025-02-07').toISOString(),
  },
  {
    id: '#4',
    userId: 'user-1',
    type: 'withdrawal',
    amount: 250.75,
    currency: 'USDT',
    status: 'completed',
    description: 'Withdrawal to external wallet',
    reference: '#1245346563478',
    counterpartyName: 'External Wallet',
    fees: 5.0,
    createdAt: new Date('2025-02-08').toISOString(),
  },
  {
    id: '#5',
    userId: 'user-1',
    type: 'transfer',
    amount: 75.25,
    currency: 'BTC',
    status: 'failed',
    description: 'Internal transfer',
    reference: '#1245346563479',
    counterpartyName: 'John Doe',
    fees: 0.5,
    createdAt: new Date('2025-02-09').toISOString(),
  },
  {
    id: '#6',
    userId: 'user-1',
    type: 'bill_payment',
    amount: 150.00,
    currency: 'USD',
    status: 'completed',
    description: 'Electricity bill payment',
    reference: '#1245346563480',
    counterpartyName: 'Power Company',
    fees: 2.0,
    createdAt: new Date('2025-02-10').toISOString(),
  },
  {
    id: '#7',
    userId: 'user-1',
    type: 'conversion',
    amount: 500.00,
    currency: 'USD',
    status: 'processing',
    description: 'USD to BTC conversion',
    reference: '#1245346563481',
    counterpartyName: 'Exchange',
    fees: 5.0,
    createdAt: new Date('2025-02-11').toISOString(),
  },
];