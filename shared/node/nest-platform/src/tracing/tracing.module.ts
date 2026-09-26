import { DynamicModule, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { PLATFORM_SERVICE_NAME } from '../constants';
import { OtelInterceptor } from './otel.interceptor';

export interface PlatformTracingOptions {
  service: string;
}

@Module({})
export class PlatformTracingModule {
  static forRoot(options: PlatformTracingOptions): DynamicModule {
    return {
      module: PlatformTracingModule,
      providers: [
        { provide: PLATFORM_SERVICE_NAME, useValue: options.service },
        { provide: APP_INTERCEPTOR, useClass: OtelInterceptor },
      ],
    };
  }
}
