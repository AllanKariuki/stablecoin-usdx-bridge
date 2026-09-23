import { DynamicModule, Module } from '@nestjs/common';
import { PlatformConfigModule } from '../../src/config/config.module';
import { PlatformModule } from '../../src/platform.module';
import { DemoConfig } from './demo-config';
import { DemoController } from './demo.controller';

/**
 * The demo app every e2e spec in this package boots via @nestjs/testing's
 * Test.createTestingModule + app.init()/app.listen() — a real INestApplication
 * wired exactly the way a consuming service (identity, bff, ...) would wire
 * it, asserted against with real HTTP requests rather than mocked units.
 *
 * Deliberately a *factory function* returning a DynamicModule, not a plain
 * `@Module({...})`-decorated class: PlatformConfigModule.forRoot() reads
 * process.env synchronously as soon as it's evaluated, and a decorator's
 * arguments evaluate at class-definition time — i.e. the moment this file is
 * first imported, before any test's beforeAll() has had a chance to set the
 * env vars DemoConfig requires. Calling createDemoAppModule() from inside
 * bootstrapDemoApp() (itself called from beforeAll, after setValidDemoEnv())
 * defers that read to exactly the right moment. NestFactory.create and
 * Test.createTestingModule's `imports` both accept a DynamicModule directly,
 * so no plain class wrapper is needed.
 */
export function createDemoAppModule(): DynamicModule {
  return {
    module: DemoAppModule,
    imports: [
      PlatformConfigModule.forRoot({ validationClass: DemoConfig, ignoreEnvFile: true }),
      PlatformModule.forRoot({ service: 'demo-service', version: '1.2.3', commit: 'abcdef0' }),
    ],
    controllers: [DemoController],
  };
}

@Module({})
export class DemoAppModule {}
