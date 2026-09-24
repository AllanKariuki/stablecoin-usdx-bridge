import { Body, Controller, Headers, Post } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
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
 * P1 scope only (see docs/building-plan.md's P1 DoD: "Make a deposit and an
 * internal transfer from the UI and watch the statement line appear").
 * fx/issuance/redemption/bridge reach core-ledger endpoints that already
 * exist and services/auth-proxy's route table already covers, but wiring
 * them through bff is deliberately left for the phase that actually needs
 * them (P2's redemption/saga work) rather than built speculatively now.
 *
 * Idempotency-Key is mandatory on every write here, matching core-ledger's
 * own requirement (core-ledger/internal/api/handlers.go's idempotencyKey())
 * — bff does not generate one on a missing header, since the whole
 * guarantee only holds if the *caller* controls it across a retry.
 */
@Controller()
export class MoneyMovementController {
  constructor(private readonly coreLedger: CoreLedgerClient) {}

  // Ownership (does fromWalletId/walletId actually belong to the caller) is
  // enforced by core-ledger's own posting engine returning UNKNOWN_WALLET/
  // insufficient-funds-style errors for a wallet the caller has no business
  // touching — bff doesn't duplicate that check on the write path (unlike
  // the wallets/transactions read paths, which do, because there the
  // alternative was silently leaking another user's data, not just a write
  // core-ledger would reject anyway). @CurrentUser() below still runs, so a
  // request missing X-User-Id entirely is still rejected before reaching
  // core-ledger at all.

  @Post('deposits')
  deposit(
    @Body() body: DepositBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() _auth: AuthContext,
  ): Promise<TransactionView> {
    requireIdempotencyKey(idempotencyKey);
    return this.post('/deposits', {
      wallet_id: body.walletId,
      amount: body.amount,
      reference: body.reference ?? '',
    }, idempotencyKey);
  }

  @Post('withdrawals')
  withdraw(
    @Body() body: WithdrawBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() _auth: AuthContext,
  ): Promise<TransactionView> {
    requireIdempotencyKey(idempotencyKey);
    return this.post('/withdrawals', {
      wallet_id: body.walletId,
      amount: body.amount,
      reference: body.reference ?? '',
    }, idempotencyKey);
  }

  @Post('transfers')
  transfer(
    @Body() body: TransferBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() _auth: AuthContext,
  ): Promise<TransactionView> {
    requireIdempotencyKey(idempotencyKey);
    return this.post('/transfers', {
      from_wallet_id: body.fromWalletId,
      to_wallet_id: body.toWalletId,
      amount: body.amount,
      reference: body.reference ?? '',
    }, idempotencyKey);
  }

  private async post(
    path: string,
    coreLedgerBody: Record<string, unknown>,
    idempotencyKey: string,
  ): Promise<TransactionView> {
    const tx = await this.coreLedger.post<CoreLedgerTransaction>(path, coreLedgerBody, { idempotencyKey });
    return toTransactionView(tx);
  }
}

function requireIdempotencyKey(key: string | undefined): asserts key is string {
  if (!key) {
    throw new PlatformException(400, 'MISSING_IDEMPOTENCY_KEY', 'Idempotency-Key header is required');
  }
}
