import { Injectable } from '@nestjs/common';
import { PlatformException } from '@damp/nest-platform';
import { AuthContext } from '../auth/current-user.decorator';
import { WalletsService } from './wallets.service';

/**
 * requireOwnWallets is the write-path half of the "downstream, where the
 * resource is visible" split documented on WalletsController: the gateway
 * knows the caller holds some wallet-write permission, never whose wallet a
 * given wallet id is. Every write that moves value must run this before
 * asking core-ledger to post, because core-ledger has no caller identity of
 * its own — it will post to whatever wallet id it is given, and merely
 * recording the actor is not an authorization check.
 *
 * Deliberately no *:any escape hatch: an operator moving a customer's money
 * goes through the audited operator paths (manual adjustments, maker-checker),
 * not a flag that would turn this check off for every route at once.
 */
@Injectable()
export class WalletOwnership {
  constructor(private readonly wallets: WalletsService) {}

  async requireOwnWallets(auth: AuthContext, walletIds: string[]): Promise<void> {
    for (const walletId of walletIds) {
      if (!walletId) {
        throw new PlatformException(400, 'INVALID_REQUEST', 'a wallet id is required');
      }
      const wallet = await this.wallets.getWallet(walletId);
      if (wallet.userId !== auth.userId) {
        throw new PlatformException(403, 'FORBIDDEN', "cannot act on another user's wallet");
      }
    }
  }
}
