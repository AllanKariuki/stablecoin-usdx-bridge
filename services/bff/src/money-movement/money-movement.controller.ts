import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { WalletOwnership } from '../wallets/wallet-ownership.service';
import { CoreLedgerTransaction, toTransactionView, TransactionView } from '../transactions/transaction.types';

interface DepositBody {
  walletId: string;
  amount: string;
  reference?: string;
}

interface WithdrawBody {
  walletId: string;
  amount: string;
  reference?: string;
}

interface TransferBody {
  fromWalletId: string;
  toWalletId: string;
  amount: string;
  reference?: string;
}

/**
 * The money-movement routes, and who is allowed to reach which one.
 *
 * - **POST /deposits and POST /withdrawals are operator-only manual
 *   adjustments.** A customer's fiat moves through services/payments'
 *   payment-intent path, where a rail has to confirm the money moved before
 *   core-ledger is asked to book it. These routes skip the rail entirely, so
 *   they require wallets:adjust:manual (treasury and admin only, checked here
 *   as well as at the gateway) and are for treasury corrections, never
 *   self-service money movement. An operator adjusts somebody else's wallet
 *   by design, so the permission — not wallet ownership — is the control.
 * - **POST /transfers is own-wallet-only.** The destination of a transfer may
 *   be someone else's wallet by design, but the source must belong to the
 *   caller; core-ledger has no caller identity of its own and will post
 *   against whatever wallet id it is handed. A transfer never crosses the
 *   platform boundary, so no rail is involved.
 * - **The actor is always forwarded.** Without X-User-Id, core-ledger records
 *   initiated_by="api", which makes a money movement impossible to attribute
 *   to the person who asked for it.
 *
 * Idempotency-Key is mandatory on every write here, matching core-ledger's
 * own requirement (core-ledger/internal/api/handlers.go's idempotencyKey())
 * — bff does not generate one on a missing header, since the whole
 * guarantee only holds if the *caller* controls it across a retry.
 */
@Controller()
export class MoneyMovementController {
  constructor(
    private readonly coreLedger: CoreLedgerClient,
    private readonly ownership: WalletOwnership,
  ) {}

  @Post('deposits')
  deposit(
    @Body() body: DepositBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
  ): Promise<TransactionView> {
    requireIdempotencyKey(idempotencyKey);
    requireManualAdjustment(auth);
    return this.post(
      '/deposits',
      {
        wallet_id: body.walletId,
        amount: body.amount,
        reference: body.reference ?? '',
      },
      idempotencyKey,
      auth.userId,
    );
  }

  @Post('withdrawals')
  withdraw(
    @Body() body: WithdrawBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
  ): Promise<TransactionView> {
    requireIdempotencyKey(idempotencyKey);
    // An operator debits somebody else's wallet by design, so this is
    // permission-gated rather than ownership-checked.
    requireManualAdjustment(auth);
    return this.post(
      '/withdrawals',
      {
        wallet_id: body.walletId,
        amount: body.amount,
        reference: body.reference ?? '',
      },
      idempotencyKey,
      auth.userId,
    );
  }

  @Post('transfers')
  async transfer(
    @Body() body: TransferBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
  ): Promise<TransactionView> {
    requireIdempotencyKey(idempotencyKey);
    // Only the source is checked: sending money to another user's wallet is
    // the point of a transfer, and core-ledger rejects an unknown destination.
    await this.ownership.requireOwnWallets(auth, [body.fromWalletId]);
    return this.post(
      '/transfers',
      {
        from_wallet_id: body.fromWalletId,
        to_wallet_id: body.toWalletId,
        amount: body.amount,
        reference: body.reference ?? '',
      },
      idempotencyKey,
      auth.userId,
    );
  }

  private async post(
    path: string,
    coreLedgerBody: Record<string, unknown>,
    idempotencyKey: string,
    actor: string,
  ): Promise<TransactionView> {
    const tx = await this.coreLedger.post<CoreLedgerTransaction>(path, coreLedgerBody, { idempotencyKey, actor });
    return toTransactionView(tx);
  }
}

export function requireIdempotencyKey(key: string | undefined): asserts key is string {
  if (!key) {
    throw new PlatformException(400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key header is required');
  }
}

/**
 * Defence in depth: auth-proxy already limits /deposits and /withdrawals to
 * wallets:adjust:manual, but a bff reachable without the gateway must not
 * become a way to move fiat with no payment rail behind it.
 */
export function requireManualAdjustment(auth: AuthContext): void {
  if (!auth.permissions.includes('wallets:adjust:manual')) {
    throw new PlatformException(
      403,
      'INSUFFICIENT_PERMISSIONS',
      'moving fiat without a payment rail requires wallets:adjust:manual',
    );
  }
}
