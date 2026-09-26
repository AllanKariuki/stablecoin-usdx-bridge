import { DynamicModule, Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { PLATFORM_VERSION_INFO, VersionInfo } from '../constants';
import { PlatformHealthController } from './health.controller';
import { PlatformHealthService } from './health.service';

export interface PlatformHealthOptions {
  service: string;
  /** Overridable at build time; defaults to "dev", matching main.go's var version = "dev". */
  version?: string;
  /** Overridable at build time; defaults to "none", matching main.go's var commit = "none". */
  commit?: string;
}

@Module({})
export class PlatformHealthModule {
  static forRoot(options: PlatformHealthOptions): DynamicModule {
    const versionInfo: VersionInfo = {
      service: options.service,
      version: options.version ?? 'dev',
      commit: options.commit ?? 'none',
    };

    return {
      module: PlatformHealthModule,
      imports: [TerminusModule],
      controllers: [PlatformHealthController],
      providers: [PlatformHealthService, { provide: PLATFORM_VERSION_INFO, useValue: versionInfo }],
      exports: [PlatformHealthService],
    };
  }
}
