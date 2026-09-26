import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { IdentityConfig } from './config/identity-config';
import { CoreLedgerModule } from './core-ledger/core-ledger.module';
import { DbModule } from './db/db.module';
import { KeycloakModule } from './keycloak/keycloak.module';
import { MembershipsModule } from './memberships/memberships.module';
import { OrgsModule } from './orgs/orgs.module';
import { PartiesModule } from './parties/parties.module';
import { ProvisioningModule } from './provisioning/provisioning.module';

/**
 * A factory function, not a plain `@Module`-decorated class — same reason
 * as bff's own app.module.ts: PlatformConfigModule.forRoot() reads
 * process.env synchronously at evaluation time, which for a decorator's
 * arguments means class-definition time. Calling createAppModule() from
 * inside main() (or a test's bootstrap fixture) defers that read to
 * exactly the right moment.
 */
export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: IdentityConfig }),
      PlatformModule.forRoot({ service: 'identity', version, commit }),
      DbModule,
      KeycloakModule,
      CoreLedgerModule,
      PartiesModule,
      OrgsModule,
      MembershipsModule,
      ProvisioningModule,
    ],
  };
}

@Module({})
export class AppModule {}
