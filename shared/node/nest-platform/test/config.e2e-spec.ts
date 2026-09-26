import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PlatformConfigModule } from '../src/config/config.module';
import { PlatformConfigError } from '../src/config/config.error';
import { DemoConfig } from './fixtures/demo-config';
import { clearDemoEnv, setValidDemoEnv } from './fixtures/bootstrap';

describe('PlatformConfigModule (e2e)', () => {
  afterEach(() => {
    clearDemoEnv();
  });

  it('collects every missing/invalid env var together in one PlatformConfigError, not fail-on-first', async () => {
    clearDemoEnv();
    process.env.PORT = 'not-a-number';
    process.env.LOG_LEVEL = 'not-a-real-level';
    // DATABASE_URL stays unset — required, no default.

    let caught: unknown;
    try {
      await Test.createTestingModule({
        imports: [PlatformConfigModule.forRoot({ validationClass: DemoConfig, ignoreEnvFile: true })],
      }).compile();
    } catch (err) {
      caught = err;
    }

    expect(caught).toBeInstanceOf(PlatformConfigError);
    const problems = (caught as PlatformConfigError).problems;

    // All three problems present together — the whole point of the test.
    expect(problems.some((p) => p.includes('DATABASE_URL'))).toBe(true);
    expect(problems.some((p) => p.includes('PORT'))).toBe(true);
    expect(problems.some((p) => p.includes('LOG_LEVEL'))).toBe(true);
    expect(problems.length).toBeGreaterThanOrEqual(3);

    // The aggregated message names every offending var, not just the first.
    const message = (caught as PlatformConfigError).message;
    expect(message).toContain('DATABASE_URL');
    expect(message).toContain('PORT');
    expect(message).toContain('LOG_LEVEL');
    expect(message).toMatch(/invalid configuration \(\d+ problem\(s\)\)/);
  });

  it('boots successfully and exposes defaults + overrides via ConfigService when the env is valid', async () => {
    setValidDemoEnv();
    process.env.DATABASE_URL = 'postgres://custom/db';
    delete process.env.LOG_LEVEL; // exercise the class-field default

    const moduleRef = await Test.createTestingModule({
      imports: [PlatformConfigModule.forRoot({ validationClass: DemoConfig, ignoreEnvFile: true })],
    }).compile();

    const configService = moduleRef.get(ConfigService);
    expect(configService.get('DATABASE_URL')).toBe('postgres://custom/db');
    expect(configService.get('LOG_LEVEL')).toBe('info');
    expect(configService.get('PORT')).toBe(8081);

    await moduleRef.close();
  });
});
