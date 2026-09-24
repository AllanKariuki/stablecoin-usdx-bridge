import { Controller, Get, Param, Query } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { TransactionsService, TransactionPage } from './transactions.service';
import { TransactionView } from './transaction.types';

@Controller('transactions')
export class TransactionsController {
  constructor(private readonly transactions: TransactionsService) {}

  /**
   * A caller with only transactions:read:own always gets themselves —
   * user_id is never taken from the query string for that case, only from
   * the verified auth context, so there's no way to pass ?userId=someone-
   * else and read another user's history without transactions:read:any.
   */
  @Get()
  list(
    @CurrentUser() auth: AuthContext,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<TransactionPage> {
    return this.transactions.listForUser(auth.userId, cursor, limit ? Number(limit) : undefined);
  }

  /**
   * Scoped to transactions:read:any only. core-ledger's transaction
   * response has no owner field to check against the caller (a
   * transaction touches N accounts, not one) — proper "is this mine"
   * enforcement for a single lookup needs either core-ledger to expose
   * that or a wallet cross-reference bff doesn't have yet. A
   * transactions:read:own-only caller (customer/company) already has a
   * fully scoped path via GET /transactions above; this endpoint is for
   * operators (admin/compliance/auditor/treasury) who hold :any.
   */
  @Get(':transactionId')
  async get(@Param('transactionId') transactionId: string, @CurrentUser() auth: AuthContext): Promise<TransactionView> {
    if (!auth.permissions.includes('transactions:read:any')) {
      throw new PlatformException(403, 'INSUFFICIENT_PERMISSIONS', 'looking up a transaction by id requires transactions:read:any');
    }
    return this.transactions.get(transactionId);
  }
}
