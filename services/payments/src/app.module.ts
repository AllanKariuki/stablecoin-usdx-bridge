import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { BanksModule } from './banks/banks.module';
import { PaymentsConfig } from './config/payments-config';
import { CoreLedgerModule } from './core-ledger/core-ledger.module';
import { DbModule } from './db/db.module';
import { IntentsModule } from './intents/intents.module';
import { InvoicesModule } from './invoices/invoices.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RailsModule } from './rails/rails.module';

/**
 * A factory function, not a plain `@Module`-decorated class — same reason as
 * bff, identity and rms: PlatformConfigModule.forRoot() reads process.env
 * synchronously at evaluation time, which for a decorator's arguments means
 * class-definition time. Calling this from inside main() (or a test fixture)
 * defers that read to the right moment.
 */
export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: PaymentsConfig }),
      PlatformModule.forRoot({ service: 'payments', version, commit }),
      DbModule,
      CoreLedgerModule,
      NotificationsModule,
      RailsModule,
      BanksModule,
      InvoicesModule,
      IntentsModule,
    ],
  };
}

@Module({})
export class AppModule {}
