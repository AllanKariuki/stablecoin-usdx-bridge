import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule, PlatformModule } from '@damp/nest-platform';
import { ReportingConfig } from './config/reporting-config';
import { DbModule } from './db/db.module';
import { ReportsController } from './reports/reports.controller';
import { ReportsService } from './reports/reports.service';
import { SupersetService } from './superset/superset.service';

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, SupersetService],
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
  };
}

@Module({})
export class AppModule {}
