import { Body, Controller, Get, Headers, HttpCode, Param, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { WalletsService } from '../wallets/wallets.service';
import { WalletView } from '../wallets/wallet.types';
import { requireIdempotencyKey } from '../money-movement/money-movement.controller';
import {
  CoreLedgerSagaAccepted,
  CoreLedgerTransfer,
  ExplorerTemplates,
  SagaAcceptedView,
  toSagaAcceptedView,
  toTransferView,
  TransferView,
} from './issuance.types';

interface CreateUsdxWalletBody {
  chain: string;
  address?: string;
  label?: string;
}

interface IssueBody {
  fiatWalletId: string;
  usdxWalletId: string;
  amount: string;
}

interface RedeemBody {
  usdxWalletId: string;
  fiatWalletId: string;
  amount: string;
}

const USDX = 'USDX';

/**
 * P2's browser half: issue USD-X from a fiat balance, redeem it back, and
 * poll the saga that does the on-chain part (docs/building-plan.md's P2 DoD:
 * "issue from a 250.00 USD balance … Sepolia hash is a clickable Etherscan
 * link").
 *
 * Unlike deposits and transfers (see MoneyMovementController's note on why
 * it leaves ownership to core-ledger), both wallets are checked here. An
 * issuance mints to the USD-X wallet's on-chain address and a redemption
 * burns from it; core-ledger's posting engine would happily debit Alice's
 * fiat and mint to Bob's address, because nothing about that journal is
 * unbalanced. The gateway only knows the caller holds issuance:create, not
 * whose wallets these are.
 */
@Controller()
export class IssuanceController {
  private readonly explorers: ExplorerTemplates;

  constructor(
    private readonly coreLedger: CoreLedgerClient,
    private readonly wallets: WalletsService,
    config: ConfigService,
  ) {
    this.explorers = {
      ETHEREUM: config.get<string>('ETHEREUM_EXPLORER_TX_URL', { infer: true }) ?? '',
      SOLANA: config.get<string>('SOLANA_EXPLORER_TX_URL', { infer: true }) ?? '',
    };
  }

  /**
   * Opens the caller's USD-X wallet on a chain. Idempotent: core-ledger's
   * EnsureWallet returns the existing one for the same (user, currency,
   * chain). On Solana the address is overridden with the platform custody
   * account (see core-ledger's addressFor), so it may be omitted there.
   */
  @Post('wallets/usdx')
  createUsdxWallet(@Body() body: CreateUsdxWalletBody, @CurrentUser() auth: AuthContext): Promise<WalletView> {
    if (!body?.chain) {
      throw new PlatformException(400, 'INVALID_REQUEST', 'chain is required (ETHEREUM or SOLANA)');
    }
    return this.wallets.createWallet({
      userId: auth.userId,
      currency: USDX,
      chain: body.chain,
      address: body.address ?? '',
      label: body.label ?? `USD-X on ${body.chain.toLowerCase()}`,
    });
  }

  // 202, matching core-ledger: the journal entry is final but the mint is
  // not — a client treating 201 as "done" would be wrong for ~minutes.
  @Post('issuances')
  @HttpCode(202)
  async issue(
    @Body() body: IssueBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
  ): Promise<SagaAcceptedView> {
    requireIdempotencyKey(idempotencyKey);
    await this.requireOwnWallets(auth, [body.fiatWalletId, body.usdxWalletId]);
    const raw = await this.coreLedger.post<CoreLedgerSagaAccepted>(
      '/issuances',
      { fiat_wallet_id: body.fiatWalletId, usdx_wallet_id: body.usdxWalletId, amount: body.amount },
      { idempotencyKey, actor: auth.userId },
    );
    return toSagaAcceptedView(raw);
  }

  @Post('redemptions')
  @HttpCode(202)
  async redeem(
    @Body() body: RedeemBody,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @CurrentUser() auth: AuthContext,
  ): Promise<SagaAcceptedView> {
    requireIdempotencyKey(idempotencyKey);
    await this.requireOwnWallets(auth, [body.usdxWalletId, body.fiatWalletId]);
    const raw = await this.coreLedger.post<CoreLedgerSagaAccepted>(
      '/redemptions',
      { usdx_wallet_id: body.usdxWalletId, fiat_wallet_id: body.fiatWalletId, amount: body.amount },
      { idempotencyKey, actor: auth.userId },
    );
    return toSagaAcceptedView(raw);
  }

  @Get('transfers/:correlationId')
  async transfer(
    @Param('correlationId') correlationId: string,
    @CurrentUser() auth: AuthContext,
  ): Promise<TransferView> {
    const raw = await this.coreLedger.get<CoreLedgerTransfer>(`/transfers/${encodeURIComponent(correlationId)}`);
    if (raw.user_id !== auth.userId && !auth.permissions.includes('transactions:read:any')) {
      // 404, not 403: a correlation id is derived from someone's idempotency
      // key, and confirming that one exists is a small leak for no benefit.
      throw new PlatformException(404, 'TRANSFER_NOT_FOUND', 'no such transfer');
    }
    return toTransferView(raw, this.explorers);
  }

  private async requireOwnWallets(auth: AuthContext, walletIds: string[]): Promise<void> {
    for (const walletId of walletIds) {
      if (!walletId) {
        throw new PlatformException(400, 'INVALID_REQUEST', 'both a fiat and a USD-X wallet id are required');
      }
      const wallet = await this.wallets.getWallet(walletId);
      // No *:any escape hatch: an operator moving a customer's money goes
      // through maker-checker, not through the customer's own issuance form.
      if (wallet.userId !== auth.userId) {
        throw new PlatformException(403, 'FORBIDDEN', "cannot issue or redeem against another user's wallet");
      }
    }
  }
}
