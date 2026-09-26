import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { BffConfig } from './config/bff-config';
import { CoreLedgerModule } from './core-ledger/core-ledger.module';
import { WalletsModule } from './wallets/wallets.module';
import { TransactionsModule } from './transactions/transactions.module';
import { MoneyMovementModule } from './money-movement/money-movement.module';
import { DashboardModule } from './dashboard/dashboard.module';

/**
 * A factory function, not a plain `@Module`-decorated class — same reason
 * as @damp/nest-platform's own test fixture
 * (shared/node/nest-platform/test/fixtures/demo-app.module.ts):
 * PlatformConfigModule.forRoot() reads process.env synchronously at
 * evaluation time, which for a decorator's arguments means class-definition
 * time — before a test's beforeAll() (or, in production, before main.ts's
 * own env setup) has run. Calling createAppModule() from inside main()
 * defers that read to exactly the right moment.
 */
export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: BffConfig }),
      PlatformModule.forRoot({ service: 'bff', version, commit }),
      CoreLedgerModule,
      WalletsModule,
      TransactionsModule,
      MoneyMovementModule,
      DashboardModule,
    ],
  };
}

@Module({})
export class AppModule {}
