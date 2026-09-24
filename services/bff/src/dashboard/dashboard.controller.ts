import { Controller, Get } from '@nestjs/common';
import { AuthContext, CurrentUser } from '../auth/current-user.decorator';
import { WalletsService } from '../wallets/wallets.service';
import { TransactionsService } from '../transactions/transactions.service';
import { WalletView } from '../wallets/wallet.types';
import { TransactionView } from '../transactions/transaction.types';

export interface DashboardView {
  wallets: WalletView[];
  recentTransactions: TransactionView[];
}

const RECENT_TRANSACTIONS_LIMIT = 10;

/**
 * The one call docs/building-plan.md's "Build the BFF" decision exists
 * for: "core-ledger has no list/filter endpoints, the dashboards are
 * 8-call aggregations" — this replaces however many separate requests the
 * frontend's dashboard would otherwise fire with one.
 */
@Controller('dashboard')
export class DashboardController {
  constructor(
    private readonly wallets: WalletsService,
    private readonly transactions: TransactionsService,
  ) {}

  @Get()
  async get(@CurrentUser() auth: AuthContext): Promise<DashboardView> {
    const [wallets, txPage] = await Promise.all([
      this.wallets.listOwnWallets(auth.userId),
      this.transactions.listForUser(auth.userId, undefined, RECENT_TRANSACTIONS_LIMIT),
    ]);
    return { wallets, recentTransactions: txPage.transactions };
  }
}
