import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard } from '@damp/nest-platform';
import { AuditRelayService } from './audit/audit-relay.service';
import { BanksModule } from './banks/banks.module';
import { PaymentsConfig } from './config/payments-config';
import { CoreLedgerModule } from './core-ledger/core-ledger.module';
import { DbModule } from './db/db.module';
import { IntentsModule } from './intents/intents.module';
import { InvoicesModule } from './invoices/invoices.module';
import { OutboxModule } from './outbox/outbox.module';
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
      OutboxModule,
      RailsModule,
      BanksModule,
      InvoicesModule,
      IntentsModule,
    ],
    // In the root module, beside workflow's, kyc's and compliance's.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `payments` resource client. Default role per route is
      // payments.user-proxy (svc-bff); the rail callback is @Public.
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
