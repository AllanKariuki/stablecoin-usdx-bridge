import { Injectable } from '@nestjs/common';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { CoreLedgerTransaction, toTransactionView, TransactionView } from './transaction.types';

export interface TransactionPage {
  transactions: TransactionView[];
  nextCursor: string;
}

interface CoreLedgerTransactionPage {
  transactions: CoreLedgerTransaction[];
  next_cursor: string;
}

@Injectable()
export class TransactionsService {
  constructor(private readonly coreLedger: CoreLedgerClient) {}

  /**
   * listForUser is the cross-wallet transaction feed
   * docs/building-plan.md calls out as bff's job in this phase — one call
   * here, one call to core-ledger's GET /transactions?user_id=... (see
   * core-ledger/internal/api/handlers.go's listTransactions), instead of
   * the frontend firing one request per wallet.
   */
  async listForUser(userId: string, cursor?: string, limit?: number): Promise<TransactionPage> {
    const page = await this.coreLedger.get<CoreLedgerTransactionPage>('/transactions', {
      query: { user_id: userId, cursor, limit: limit ? String(limit) : undefined },
    });
    return {
      transactions: page.transactions.map(toTransactionView),
      nextCursor: page.next_cursor,
    };
  }

  async get(transactionId: string): Promise<TransactionView> {
    const tx = await this.coreLedger.get<CoreLedgerTransaction>(`/transactions/${encodeURIComponent(transactionId)}`);
    return toTransactionView(tx);
  }
}
