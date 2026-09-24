import { Injectable } from '@nestjs/common';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { toMoney } from '../money/money';
import {
  CoreLedgerStatement,
  CoreLedgerWallet,
  StatementView,
  WalletView,
} from './wallet.types';

const DEFAULT_WALLET_CURRENCY = 'USD';

@Injectable()
export class WalletsService {
  constructor(private readonly coreLedger: CoreLedgerClient) {}

  /**
   * listOwnWallets ensures the caller has at least a default fiat wallet
   * before listing — a stand-in for what services/identity will own once it
   * exists (see docs/building-plan.md's P1 identity section: "calls POST
   * /wallets to create a party's default fiat wallet"). core-ledger's
   * POST /wallets is idempotent (EnsureWallet — see
   * core-ledger/internal/ledger/repository.go), so calling it on every list
   * request is safe, not just on first login; this keeps the P1 demo flow
   * working end to end without identity blocking it.
   */
  async listOwnWallets(userId: string): Promise<WalletView[]> {
    await this.coreLedger.post<CoreLedgerWallet>('/wallets', {
      user_id: userId,
      currency: DEFAULT_WALLET_CURRENCY,
      label: 'Main',
    });

    const { wallets } = await this.coreLedger.get<{ wallets: CoreLedgerWallet[] }>(
      `/users/${encodeURIComponent(userId)}/wallets`,
    );
    return wallets.map(toWalletView);
  }

  async getWallet(walletId: string): Promise<WalletView> {
    const wallet = await this.coreLedger.get<CoreLedgerWallet>(`/wallets/${encodeURIComponent(walletId)}`);
    return toWalletView(wallet);
  }

  async getStatement(walletId: string, from?: string, to?: string, limit?: number): Promise<StatementView> {
    const statement = await this.coreLedger.get<CoreLedgerStatement>(
      `/wallets/${encodeURIComponent(walletId)}/statement`,
      { query: { from, to, limit: limit ? String(limit) : undefined } },
    );
    return {
      walletId: statement.wallet_id,
      currency: statement.currency,
      entries: statement.entries.map((e) => ({
        seq: e.seq,
        transactionId: e.transaction_id,
        direction: e.direction,
        amount: toMoney(e.amount, e.currency),
        runningBalance: toMoney(e.running_balance, e.currency),
        currency: e.currency,
        valueDate: e.value_date,
        description: e.description,
      })),
    };
  }

  async setWalletStatus(walletId: string, status: string): Promise<WalletView> {
    const wallet = await this.coreLedger.post<CoreLedgerWallet>(`/wallets/${encodeURIComponent(walletId)}/status`, {
      status,
    });
    return toWalletView(wallet);
  }
}

function toWalletView(w: CoreLedgerWallet): WalletView {
  return {
    id: w.id,
    userId: w.user_id,
    currency: w.currency,
    chain: w.chain,
    address: w.address,
    status: w.status,
    label: w.label,
    balance: toMoney(w.balance, w.currency),
  };
}
