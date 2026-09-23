import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PLATFORM_SERVICE_NAME } from '../constants';
import { MetricsInterceptor } from './metrics.interceptor';
import { PlatformMetricsController } from './metrics.controller';
import { PlatformMetricsService } from './metrics.service';

export interface PlatformMetricsOptions {
  service: string;
}

@Module({})
export class PlatformMetricsModule {
  static forRoot(options: PlatformMetricsOptions): DynamicModule {
    return {
      module: PlatformMetricsModule,
      controllers: [PlatformMetricsController],
      providers: [
        { provide: PLATFORM_SERVICE_NAME, useValue: options.service },
        PlatformMetricsService,
        { provide: APP_INTERCEPTOR, useClass: MetricsInterceptor },
      ],
      exports: [PlatformMetricsService],
    };
  }
}
