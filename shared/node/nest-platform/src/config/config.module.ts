import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { ClassConstructor, createConfigValidator } from './config.validate';

export interface PlatformConfigOptions<T extends object> {
  /** The config class to validate process.env against. See config.validate.ts's doc comment. */
  validationClass: ClassConstructor<T>;
  /** Defaults to true, matching a single shared config surface per process. */
  isGlobal?: boolean;
  /** Passed straight through to @nestjs/config; omit to read only real env vars. */
  envFilePath?: string | string[];
  ignoreEnvFile?: boolean;
}

/**
 * PlatformConfigModule wraps @nestjs/config's ConfigModule with the one
 * behavior shared/go/platform's LoadConfig treats as non-negotiable: every
 * missing/invalid environment variable is collected and thrown together in
 * one PlatformConfigError at boot, never a fail-on-first loop.
 *
 * Usage:
 *
 *   PlatformConfigModule.forRoot({ validationClass: AppConfig })
 *
 * Downstream code injects the validated instance the normal @nestjs/config
 * way — `configService.get('DATABASE_URL', { infer: true })` — this module
 * only supplies the `validate` callback; it does not reshape @nestjs/config's
 * own API.
 */
@Module({})
export class PlatformConfigModule {
  static forRoot<T extends object>(options: PlatformConfigOptions<T>): DynamicModule {
    return {
      module: PlatformConfigModule,
      imports: [
        NestConfigModule.forRoot({
          isGlobal: options.isGlobal ?? true,
          envFilePath: options.envFilePath,
          ignoreEnvFile: options.ignoreEnvFile,
          validate: createConfigValidator(options.validationClass),
        }),
      ],
      exports: [NestConfigModule],
    };
  }
}
