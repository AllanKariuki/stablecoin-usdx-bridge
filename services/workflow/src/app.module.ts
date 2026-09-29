import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
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
  };
}

@Module({})
export class AppModule {}
