import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { PlatformHealthService } from '../src/health/health.service';
import { bootstrapDemoApp, clearDemoEnv, setValidDemoEnv } from './fixtures/bootstrap';

describe('Health endpoints (e2e)', () => {
  let app: NestExpressApplication;
  let health: PlatformHealthService;

  beforeAll(async () => {
    setValidDemoEnv();
    app = await bootstrapDemoApp();
    health = app.get(PlatformHealthService);
  });

  afterAll(async () => {
    await app.close();
    clearDemoEnv();
  });

  it('GET /healthz always returns 200, even after SetReady(false)', async () => {
    health.setReady(false);
    const res = await request(app.getHttpServer()).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
    health.setReady(true); // restore for subsequent tests
  });

  it('GET /readyz returns 200 with no registered checks and ready=true', async () => {
    health.setReady(true);
    const res = await request(app.getHttpServer()).get('/readyz');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });

  it('GET /readyz flips to 503 when a registered check fails', async () => {
    health.addCheck('flaky-dep', async () => {
      throw new Error('connection refused');
    });

    const res = await request(app.getHttpServer()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.status).toBe('degraded');
    expect(res.body.checks['flaky-dep']).toEqual({ ok: false, error: 'connection refused' });
  });

  it('GET /readyz flips to 503 when SetReady(false) is called, independent of checks', async () => {
    const readyHealth = app.get(PlatformHealthService);
    readyHealth.addCheck('always-up', async () => undefined);
    readyHealth.setReady(false);

    const res = await request(app.getHttpServer()).get('/readyz');
    expect(res.status).toBe(503);
    expect(res.body.checks['always-up']).toEqual({ ok: true });

    readyHealth.setReady(true);
  });

  it('GET /version reports the injected service/version/commit', async () => {
    const res = await request(app.getHttpServer()).get('/version');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ service: 'demo-service', version: '1.2.3', commit: 'abcdef0' });
  });
});
