import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard } from '@damp/nest-platform';
import { AuditRelayService } from './audit/audit-relay.service';
import { WorkflowConfig } from './config/workflow-config';
import { DbModule } from './db/db.module';
import { CallbacksService } from './requests/callbacks.service';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';

@Module({
  controllers: [RequestsController],
  providers: [RequestsService, CallbacksService],
  exports: [RequestsService],
})
export class RequestsModule {}

export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: WorkflowConfig }),
      PlatformModule.forRoot({ service: 'workflow', version, commit }),
      DbModule,
      RequestsModule,
    ],
    // In the root module because that is where PlatformModule's exports
    // (the metrics registry the relay's backlog gauge registers on) are
    // visible.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `workflow` resource client. Reads default to
      // workflow.user-proxy (svc-bff); POST /approval-requests declares
      // workflow.propose OR workflow.user-proxy.
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
