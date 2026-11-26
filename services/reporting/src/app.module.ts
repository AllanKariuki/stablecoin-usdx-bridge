import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PlatformConfigModule, PlatformModule, ServiceAuthGuard, ServiceTokenClient } from '@damp/nest-platform';
import { AuditRelayService } from './audit/audit-relay.service';
import { ReportingConfig } from './config/reporting-config';
import { DbModule } from './db/db.module';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { SupersetService } from './superset/superset.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, SupersetService, ServiceTokenClient],
})
export class ReportingModule {}

export function createAppModule(version?: string, commit?: string): DynamicModule {
  return {
    module: AppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: ReportingConfig }),
      PlatformModule.forRoot({ service: 'reporting', version, commit }),
      DbModule,
      ReportingModule,
    ],
    // In the root module, beside the other producers'.
    providers: [
      AuditRelayService,
      // H3: every route carries a Keycloak service-account JWT whose audience
      // is the `reporting` resource client; the default role is
      // reporting.user-proxy (svc-bff).
      { provide: APP_GUARD, useClass: ServiceAuthGuard },
    ],
  };
}

@Module({})
export class AppModule {}
