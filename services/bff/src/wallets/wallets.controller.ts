import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { WalletsService } from './wallets.service';
import { StatementView, WalletView } from './wallet.types';

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
  constructor(private readonly wallets: WalletsService) {}

  @Get()
  listOwn(@CurrentUser() auth: AuthContext): Promise<WalletView[]> {
    return this.wallets.listOwnWallets(auth.userId);
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
