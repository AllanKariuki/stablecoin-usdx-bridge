import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard, ServiceTokenClient } from '@damp/nest-platform';
import { ApprovalsController } from './cases/approvals.controller';
import { CasesController } from './cases/cases.controller';
import { CasesService } from './cases/cases.service';
import { AuditRelayService } from './audit/audit-relay.service';
import { KycConfig } from './config/kyc-config';
import { CoreLedgerClient } from './core-ledger/core-ledger.client';
import { DbModule } from './db/db.module';
import { StubKycProvider } from './providers/kyc-provider';
import { StorageService } from './storage/storage.service';
import { InternalTiersController } from './tiers/internal-tiers.controller';
import { TiersRepository } from './tiers/tiers.repository';
import { WorkflowClient } from './workflow/workflow.client';

@Module({
  controllers: [CasesController, ApprovalsController, InternalTiersController],
  providers: [CasesService, TiersRepository, StubKycProvider, StorageService, WorkflowClient, CoreLedgerClient, ServiceTokenClient],
})
export class KycModule {}

export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: KycConfig }),
      PlatformModule.forRoot({ service: 'kyc', version, commit }),
      DbModule,
      KycModule,
    ],
    // In the root module because that is where PlatformModule's exports
    // (the metrics registry the relay's backlog gauge registers on) are
    // visible.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `kyc` resource client. The default role is kyc.user-proxy
      // (svc-bff); the workflow decision callback is @HmacAuthenticated.
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
