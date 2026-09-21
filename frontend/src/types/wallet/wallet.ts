export type ChainType = 'ethereum' | 'solana' | 'bitcoin' | 'polygon' | 'bsc';
export type WalletType = 'hot' | 'warm' | 'cold';
export type WalletStatus = 'active' | 'frozen' | 'under-review' | 'pending';
export type CustodyType = 'self' | 'custodial' | 'multi-sig';

export interface Chain {
  id: string;
  name: string;
  icon: string;
  totalBalance: number;
  totalBalanceUSD: number;
  available: number;
  reserved: number;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  disabledReason?: string;
}

export interface Wallet {
  id: string;
  walletId: string;
  chain: ChainType;
  type: WalletType;
  custodyType: CustodyType;
  label: string;
  notes?: string;
  available: number;
  reserved: number;
  availableUSD: number;
  reservedUSD: number;
  lastSweepAt?: string;
  status: WalletStatus;
  address: string;
  createdAt: string;
  tags?: string[];
}

export interface SweepHistory {
  id: string;
  walletId: string;
  amount: number;
  amountUSD: number;
  timestamp: string;
  txHash: string;
  status: 'pending' | 'completed' | 'failed';
  fee: number;
  destinationAddress: string;
}

export interface WalletTransaction {
  id: string;
  txHash: string;
  type: 'deposit' | 'withdrawal' | 'sweep' | 'internal';
  amount: number;
  amountUSD: number;
  fee: number;
  status: 'pending' | 'confirmed' | 'failed';
  timestamp: string;
  confirmations: number;
  fromAddress: string;
  toAddress: string;
  blockNumber?: number;
}

export interface WalletDetailStats {
  totalInflow: number;
  totalOutflow: number;
  totalInflowUSD: number;
  totalOutflowUSD: number;
  transactionCount: number;
  lastActivityAt: string;
  averageTransactionSize: number;
}

export interface WalletFilters {
  chain?: ChainType;
  asset?: string;
  custodyType?: CustodyType;
  walletType?: WalletType;
  status?: WalletStatus;
  search?: string;
}

export interface SweepRequest {
  walletId: string;
  amount: number;
  sweepAll: boolean;
  destinationAddress: string;
  note?: string;
}

export interface ExportWalletStatement {
  walletId: string;
  startDate: string;
  endDate: string;
  format: 'csv' | 'pdf';
  includeTransactions: boolean;
  includeBalanceHistory: boolean;
}

export interface WalletState {
  chains: Chain[];
  wallets: Wallet[];
  selectedWallet: Wallet | null;
  sweepHistory: SweepHistory[];
  walletTransactions: WalletTransaction[];
  walletStats: WalletDetailStats | null;
  filters: WalletFilters;
  loading: boolean;
  error: string | null;
}
