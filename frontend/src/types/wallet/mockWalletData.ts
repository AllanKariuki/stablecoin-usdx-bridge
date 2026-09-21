import type { Chain, Wallet, SweepHistory, WalletTransaction, WalletDetailStats } from './wallet';

export const mockChains: Chain[] = [
  {
    id: '1',
    name: 'Ethereum',
    icon: 'ethereum',
    totalBalance: 25.5,
    totalBalanceUSD: 51000,
    available: 25.5,
    reserved: 0,
    depositEnabled: true,
    withdrawalEnabled: true
  },
  {
    id: '2',
    name: 'Solana',
    icon: 'solana',
    totalBalance: 500,
    totalBalanceUSD: 15000,
    available: 500,
    reserved: 0,
    depositEnabled: true,
    withdrawalEnabled: true
  },
  {
    id: '3',
    name: 'Bitcoin',
    icon: 'bitcoin',
    totalBalance: 0.5,
    totalBalanceUSD: 21000,
    available: 0.5,
    reserved: 0,
    depositEnabled: true,
    withdrawalEnabled: false,
    disabledReason: 'Network upgrade in progress'
  },
  {
    id: '4',
    name: 'Polygon',
    icon: 'polygon',
    totalBalance: 1000,
    totalBalanceUSD: 800,
    available: 900,
    reserved: 100,
    depositEnabled: true,
    withdrawalEnabled: true
  }
];

export const mockWallets: Wallet[] = [
  {
    id: '1',
    walletId: 'WALLET-ETH-001',
    chain: 'ethereum',
    type: 'hot',
    custodyType: 'self',
    label: 'Main Ethereum Wallet',
    notes: 'Primary wallet for daily transactions',
    available: 20.5,
    reserved: 5.0,
    availableUSD: 41000,
    reservedUSD: 10000,
    status: 'active',
    address: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    createdAt: '2024-01-15T10:00:00Z',
    tags: ['primary', 'trading'],
    lastSweepAt: '2025-11-20T08:00:00Z'
  },
  {
    id: '2',
    walletId: 'WALLET-SOL-001',
    chain: 'solana',
    type: 'cold',
    custodyType: 'custodial',
    label: 'Solana Savings Wallet',
    available: 500,
    reserved: 0,
    availableUSD: 15000,
    reservedUSD: 0,
    status: 'active',
    address: '8iNbBrXF3MZx8NbJ5SU7T3n8pK7r4Z1x9sQ0q2W3e5T',
    createdAt: '2024-03-20T14:30:00Z',
    tags: ['savings'],
    lastSweepAt: '2025-11-15T12:00:00Z'
  },
  {
    id: '3',
    walletId: 'WALLET-BTC-001',
    chain: 'bitcoin',
    type: 'cold',
    custodyType: 'multi-sig',
    label: 'Bitcoin Cold Storage',
    available: 0.5,
    reserved: 0,
    availableUSD: 21000,
    reservedUSD: 0,
    status: 'active',
    address: '1A1z7agoat3YFWeezzH4MvkY2RjTxRUs3i',
    createdAt: '2024-06-10T09:15:00Z',
    tags: ['cold-storage', 'long-term']
  },
  {
    id: '4',
    walletId: 'WALLET-POL-001',
    chain: 'polygon',
    type: 'warm',
    custodyType: 'self',
    label: 'Polygon Trading Wallet',
    available: 900,
    reserved: 100,
    availableUSD: 720,
    reservedUSD: 80,
    status: 'active',
    address: '0x8626f6940E2eb28930DF711671CF0023Ba6E7F7a',
    createdAt: '2024-09-05T16:45:00Z',
    tags: ['trading', 'defi']
  }
];

export const mockSweepHistory: SweepHistory[] = [
  {
    id: '1',
    walletId: 'WALLET-ETH-001',
    amount: 5.0,
    amountUSD: 10000,
    timestamp: '2025-11-20T08:00:00Z',
    txHash: '0xabc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
    status: 'completed',
    fee: 0.05,
    destinationAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb'
  },
  {
    id: '2',
    walletId: 'WALLET-SOL-001',
    amount: 100,
    amountUSD: 3000,
    timestamp: '2025-11-15T12:00:00Z',
    txHash: 'xyz987abc654def321ghi098jkl765mno432pqr109stu876vwx543yz',
    status: 'completed',
    fee: 0.00025,
    destinationAddress: '8iNbBrXF3MZx8NbJ5SU7T3n8pK7r4Z1x9sQ0q2W3e5T'
  }
];

export const mockWalletTransactions: WalletTransaction[] = [
  {
    id: '1',
    txHash: '0xabc123def456ghi789jkl012mno345pqr678stu901vwx234yz',
    type: 'deposit',
    amount: 10.0,
    amountUSD: 20000,
    fee: 0.1,
    status: 'confirmed',
    timestamp: '2025-11-18T14:30:00Z',
    confirmations: 12,
    fromAddress: 'external-address-1',
    toAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    blockNumber: 20506800
  },
  {
    id: '2',
    txHash: '0xdef789abc123ghi456jkl901mno234pqr567stu890vwx123yz',
    type: 'withdrawal',
    amount: 5.0,
    amountUSD: 10000,
    fee: 0.05,
    status: 'confirmed',
    timestamp: '2025-11-17T10:15:00Z',
    confirmations: 6,
    fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    toAddress: 'external-address-2',
    blockNumber: 20506600
  },
  {
    id: '3',
    txHash: '0xghi456def123abc789jkl678mno345pqr012stu789vwx456yz',
    type: 'internal',
    amount: 2.5,
    amountUSD: 5000,
    fee: 0.025,
    status: 'confirmed',
    timestamp: '2025-11-16T16:45:00Z',
    confirmations: 18,
    fromAddress: '0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb',
    toAddress: '0x8626f6940E2eb28930DF671CF0023Ba6E7F7a',
    blockNumber: 20506400
  }
];

export const mockWalletStats: WalletDetailStats = {
  totalInflow: 50000,
  totalOutflow: 25000,
  totalInflowUSD: 50000,
  totalOutflowUSD: 25000,
  transactionCount: 45,
  lastActivityAt: '2025-11-20T08:00:00Z',
  averageTransactionSize: 1111.11
};
