import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard } from '@damp/nest-platform';
import { AuditRelayService } from './audit/audit-relay.service';
import { PricingConfig } from './config/pricing-config';
import { CoreLedgerModule } from './core-ledger/core-ledger.module';
import { DbModule } from './db/db.module';
import { ExposureModule } from './exposure/exposure.module';
import { PairsModule } from './pairs/pairs.module';
import { QuotesModule } from './quotes/quotes.module';
import { RatesModule } from './rates/rates.module';

/**
 * A factory function, not a plain `@Module`-decorated class — same reason
 * as rms's: PlatformConfigModule.forRoot() reads process.env synchronously
 * at evaluation time, which for a decorator's arguments means
 * class-definition time. Calling createAppModule() from inside main() (or a
 * test's bootstrap fixture) defers that read to exactly the right moment.
 */
export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: PricingConfig }),
      PlatformModule.forRoot({ service: 'pricing', version, commit }),
      DbModule,
      CoreLedgerModule,
      RatesModule,
      PairsModule,
      ExposureModule,
      QuotesModule,
    ],
    // In the root module, beside the other producers'.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose
      // audience is the `pricing` resource client. There is no default
      // role here — every route declares its own (pricing.quote /
      // pricing.read / pricing.admin), because nothing this service does
      // is user-proxy-shaped by default.
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
