import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard, ServiceTokenClient } from '@damp/nest-platform';
import { CasesController } from './cases/cases.controller';
import { AuditRelayService } from './audit/audit-relay.service';
import { ComplianceConfig } from './config/compliance-config';
import { CoreLedgerClient } from './core-ledger/core-ledger.client';
import { DbModule } from './db/db.module';
import { ApprovalsController } from './enforcement/approvals.controller';
import { EnforcementService } from './enforcement/enforcement.service';
import { WorkflowClient } from './enforcement/workflow.client';
import { IngestController } from './ingest/ingest.controller';
import { IngestService } from './ingest/ingest.service';
import { OutboxConsumer } from './ingest/outbox-consumer';
import { ScreeningService } from './screening/screening.service';

@Module({
  controllers: [CasesController, IngestController, ApprovalsController],
  providers: [IngestService, ScreeningService, EnforcementService, WorkflowClient, CoreLedgerClient, ServiceTokenClient, OutboxConsumer],
})
export class ComplianceModule {}

export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: ComplianceConfig }),
      PlatformModule.forRoot({ service: 'compliance', version, commit }),
      DbModule,
      ComplianceModule,
    ],
    // In the root module because that is where PlatformModule's exports
    // (the metrics registry the relay's backlog gauge registers on) are
    // visible.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `compliance` resource client. Default role is
      // compliance.user-proxy (svc-bff); POST /internal/outbox declares
      // compliance.ingest (svc-core-ledger-worker); the workflow decision
      // callback is @HmacAuthenticated.
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
