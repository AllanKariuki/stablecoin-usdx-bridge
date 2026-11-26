import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard } from '@damp/nest-platform';
import { AuditRelayService } from './audit/audit-relay.service';
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
    // In the root module because that is where PlatformModule's exports
    // (the metrics registry the relay's backlog gauge registers on) are
    // visible.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `identity` resource client. The default role is
      // identity.user-proxy; GET /internal/parties/by-subject declares
      // identity.resolve (svc-auth-proxy, svc-notifications).
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
