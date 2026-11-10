import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { ApprovalsController } from './cases/approvals.controller';
import { CasesController } from './cases/cases.controller';
import { CasesService } from './cases/cases.service';
import { KycConfig } from './config/kyc-config';
import { CoreLedgerClient } from './core-ledger/core-ledger.client';
import { DbModule } from './db/db.module';
import { StubKycProvider } from './providers/kyc-provider';
import { StorageService } from './storage/storage.service';
import { TiersRepository } from './tiers/tiers.repository';
import { WorkflowClient } from './workflow/workflow.client';

@Module({
  controllers: [CasesController, ApprovalsController],
  providers: [CasesService, TiersRepository, StubKycProvider, StorageService, WorkflowClient, CoreLedgerClient],
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
  };
}

@Module({})
export class AppModule {}
