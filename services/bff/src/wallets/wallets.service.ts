import { Injectable } from '@nestjs/common';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { toMoney } from '../money/money';
import {
  CoreLedgerStatement,
  CoreLedgerWallet,
  CurrencyView,
  StatementView,
  WalletView,
} from './wallet.types';

const DEFAULT_WALLET_CURRENCY = 'USD';

/** The native chain of each custodial crypto currency — core-ledger's
 * ledger.NativeChain (core-ledger/internal/ledger/models.go), duplicated
 * here so POST /wallets can send the chain core-ledger would default to
 * anyway. Fiat and USD-X have none. */
const NATIVE_CHAINS: Record<string, string> = {
  BTC: 'BITCOIN',
  ETH: 'ETHEREUM',
  SOL: 'SOLANA',
};

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

  async createWallet(input: {
    userId: string;
    currency: string;
    chain: string;
    address: string;
    label: string;
  }): Promise<WalletView> {
    const wallet = await this.coreLedger.post<CoreLedgerWallet>('/wallets', {
      user_id: input.userId,
      currency: input.currency,
      chain: input.chain,
      address: input.address,
      label: input.label,
    });
    return toWalletView(wallet);
  }

  /**
   * PATCHes the metadata core-ledger allows to change — the default flag
   * and the label — through to the wallet's owner. Ownership is the
   * controller's check, not this method's (see WalletOwnership).
   */
  async updateWallet(
    walletId: string,
    input: { isDefault?: boolean; label?: string },
  ): Promise<WalletView> {
    const body: Record<string, unknown> = {};
    if (input.isDefault !== undefined) body.is_default = input.isDefault;
    if (input.label !== undefined) body.label = input.label;
    const wallet = await this.coreLedger.patch<CoreLedgerWallet>(`/wallets/${encodeURIComponent(walletId)}`, body);
    return toWalletView(wallet);
  }

  /** The supported currencies, straight from core-ledger's chart — the
   * source of truth the portal's wallet and conversion screens render from
   * (slice 4b's GET /currencies). */
  async listCurrencies(): Promise<CurrencyView[]> {
    const { currencies } = await this.coreLedger.get<{ currencies: Array<CurrencyView & { native_chain: string }> }>(
      '/currencies',
    );
    return currencies.map((c) => ({
      code: c.code,
      kind: c.kind,
      decimals: c.decimals,
      name: c.name,
      nativeChain: c.native_chain,
    }));
  }

  /** The chain a wallet in this currency lives on: the native chain for
   * custodial crypto, none for fiat. USD-X is deliberately absent — it
   * lives on two chains and goes through POST /wallets/usdx. */
  nativeChainFor(currency: string): string {
    return NATIVE_CHAINS[currency] ?? '';
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
    isDefault: w.is_default,
    balance: toMoney(w.balance, w.currency),
  };
}
