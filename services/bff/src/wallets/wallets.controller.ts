import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { WalletOwnership } from './wallet-ownership.service';
import { WalletsService } from './wallets.service';
import { StatementView, WalletView } from './wallet.types';

interface CreateWalletBody {
  currency?: string;
  label?: string;
}

interface UpdateWalletBody {
  is_default?: boolean;
  label?: string;
}

/**
 * Ownership (wallets:read:own vs wallets:read:any) is enforced here, not at
 * the gateway — services/auth-proxy's route table only knows the caller
 * holds *one of* those permissions for this route shape, never which
 * wallet a given :walletId actually belongs to (see
 * services/auth-proxy/internal/authztable's package doc). This is the
 * "downstream, where the resource is visible" half of that split.
 */
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly ownership: WalletOwnership,
  ) {}

  @Get()
  listOwn(@CurrentUser() auth: AuthContext): Promise<WalletView[]> {
    return this.wallets.listOwnWallets(auth.userId);
  }

  /**
   * Opens a wallet in any supported currency for the caller (slice 4b).
   * The user is never taken from the body — only from the auth context —
   * and USD-X is refused: it lives on two chains, so it goes through the
   * existing POST /wallets/usdx route which requires one. Idempotency is
   * core-ledger's: EnsureWallet returns the existing wallet for the same
   * (user, currency, chain).
   */
  @Post()
  async create(@Body() body: CreateWalletBody, @CurrentUser() auth: AuthContext): Promise<WalletView> {
    const currency = (body.currency ?? '').trim().toUpperCase();
    if (!currency) {
      throw new PlatformException(400, 'INVALID_REQUEST', 'currency is required');
    }
    if (currency === 'USDX') {
      throw new PlatformException(
        422,
        'USE_USDX_ROUTE',
        'USD-X lives on two chains: open it through POST /wallets/usdx with the chain you want',
      );
    }
    return this.wallets.createWallet({
      userId: auth.userId,
      currency,
      chain: this.wallets.nativeChainFor(currency),
      address: '',
      label: body.label ?? '',
    });
  }

  /**
   * PATCHes the metadata a wallet owner may change — the default flag and
   * the label. Ownership is checked here exactly like every other write on
   * a :walletId route (see WalletOwnership); core-ledger enforces the rest
   * (is_default may only be set true, labels are capped at 64 runes).
   */
  @Patch(':walletId')
  async update(
    @Param('walletId') walletId: string,
    @Body() body: UpdateWalletBody,
    @CurrentUser() auth: AuthContext,
  ): Promise<WalletView> {
    await this.ownership.requireOwnWallets(auth, [walletId]);
    return this.wallets.updateWallet(walletId, { isDefault: body.is_default, label: body.label });
  }

  @Get(':walletId')
  async get(@Param('walletId') walletId: string, @CurrentUser() auth: AuthContext): Promise<WalletView> {
    const wallet = await this.wallets.getWallet(walletId);
    assertOwnedOrAny(wallet.userId, auth, 'wallets:read:any');
    return wallet;
  }

  @Get(':walletId/statement')
  async statement(
    @Param('walletId') walletId: string,
    @CurrentUser() auth: AuthContext,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): Promise<StatementView> {
    const wallet = await this.wallets.getWallet(walletId);
    assertOwnedOrAny(wallet.userId, auth, 'wallets:read:any');
    return this.wallets.getStatement(walletId, from, to, limit ? Number(limit) : undefined);
  }

  @Post(':walletId/status')
  async setStatus(
    @Param('walletId') walletId: string,
    @Body('status') status: string,
    @CurrentUser() auth: AuthContext,
  ): Promise<WalletView> {
    // wallets:status:manage is never an "own" permission (see
    // shared/authz/permissions.yaml — customers/companies don't hold it at
    // all), so this one is a flat permission check, no ownership branch.
    if (!auth.permissions.includes('wallets:status:manage')) {
      throw new PlatformException(403, 'INSUFFICIENT_PERMISSIONS', 'caller lacks wallets:status:manage');
    }
    return this.wallets.setWalletStatus(walletId, status);
  }
}

function assertOwnedOrAny(ownerUserId: string, auth: AuthContext, anyPermission: string): void {
  if (ownerUserId === auth.userId) return;
  if (auth.permissions.includes(anyPermission)) return;
  throw new PlatformException(403, 'FORBIDDEN', "cannot access another user's wallet without a *:any permission");
}
