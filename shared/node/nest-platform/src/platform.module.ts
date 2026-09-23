import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { PlatformLoggingModule } from './logging/logging.module';
import { RequestIdInterceptor } from './logging/request-id.interceptor';
import { PlatformTracingModule } from './tracing/tracing.module';
import { PlatformHealthModule } from './health/health.module';
import { PlatformMetricsModule } from './metrics/metrics.module';
import { ErrorEnvelopeFilter } from './errors/error-envelope.filter';

export interface PlatformModuleOptions {
  service: string;
  /** pino level name. Defaults to 'info'. */
  logLevel?: string;
  /** Overridable at build time; defaults to "dev". */
  version?: string;
  /** Overridable at build time; defaults to "none". */
  commit?: string;
}

/**
 * PlatformModule.forRoot(...) is the one-line equivalent of wiring
 * shared/go/platform's Chain + NewHealth + NewMetrics + ErrorHandler
 * together in main.go. It installs, in the same order the plan specifies
 * (recover → requestid → otel → logger → metrics), every cross-cutting
 * piece except typed config — PlatformConfigModule stays a separate import
 * since its validation class is inherently service-specific (see
 * config/config.module.ts) the same way shared/go/platform.LoadConfig is a
 * standalone call in main.go, not bundled into Chain.
 *
 * Usage (a service's app.module.ts):
 *
 *   @Module({
 *     imports: [
 *       PlatformConfigModule.forRoot({ validationClass: AppConfig }),
 *       PlatformModule.forRoot({ service: 'identity', version, commit }),
 *     ],
 *   })
 *   export class AppModule {}
 *
 * Then in main.ts, after `app.init()`/before `app.listen()`:
 *
 *   installGracefulShutdown(app, app.get(PlatformHealthService), app.get(Logger));
 *
 * PlatformHealthService and PlatformMetricsService are exported so a
 * service can inject them to call `addCheck(name, fn)` (the AddCheck
 * equivalent) or read `.registry` directly.
 */
@Module({})
export class PlatformModule {
  static forRoot(options: PlatformModuleOptions): DynamicModule {
    return {
      module: PlatformModule,
      imports: [
        PlatformLoggingModule.forRoot({ service: options.service, level: options.logLevel }),
        PlatformTracingModule.forRoot({ service: options.service }),
        PlatformHealthModule.forRoot({ service: options.service, version: options.version, commit: options.commit }),
        PlatformMetricsModule.forRoot({ service: options.service }),
      ],
      providers: [
        { provide: APP_FILTER, useClass: ErrorEnvelopeFilter },
        { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
      ],
      exports: [PlatformLoggingModule, PlatformHealthModule, PlatformMetricsModule],
    };
  }
}
