import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { CasesController } from './cases/cases.controller';
import { ComplianceConfig } from './config/compliance-config';
import { CoreLedgerClient } from './core-ledger/core-ledger.client';
import { DbModule } from './db/db.module';
import { ApprovalsController } from './enforcement/approvals.controller';
import { EnforcementService } from './enforcement/enforcement.service';
import { WorkflowClient } from './enforcement/workflow.client';
import { IngestController } from './ingest/ingest.controller';
import { IngestService } from './ingest/ingest.service';
import { ScreeningService } from './screening/screening.service';

@Module({
  controllers: [CasesController, IngestController, ApprovalsController],
  providers: [IngestService, ScreeningService, EnforcementService, WorkflowClient, CoreLedgerClient],
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
  };
}

@Module({})
export class AppModule {}
