import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { bootstrapDemoApp, clearDemoEnv, setValidDemoEnv } from './fixtures/bootstrap';

describe('/metrics (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    setValidDemoEnv();
    app = await bootstrapDemoApp();
  });

  afterAll(async () => {
    await app.close();
    clearDemoEnv();
  });

  it('records real request counters, labeled by matched route/method/status', async () => {
    await request(app.getHttpServer()).get('/ok').expect(200);
    await request(app.getHttpServer()).get('/ok').expect(200);
    await request(app.getHttpServer()).get('/boom').expect(409);

    const res = await request(app.getHttpServer()).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/plain');

    const body: string = res.text;
    expect(body).toContain('http_requests_total');
    expect(body).toContain('http_request_duration_seconds');
    expect(body).toContain('http_requests_in_flight');
    expect(body).toContain('service="demo-service"');

    // Route label uses the matched pattern, not the raw path — /ok is
    // static so pattern === path here, but the assertion is on the label
    // actually being present and carrying the right counts.
    const okLine = body
      .split('\n')
      .find((l) => l.startsWith('http_requests_total') && l.includes('route="/ok"') && l.includes('status="200"'));
    expect(okLine).toBeDefined();
    expect(okLine).toMatch(/}\s+2$/);

    const boomLine = body
      .split('\n')
      .find(
        (l) => l.startsWith('http_requests_total') && l.includes('route="/boom"') && l.includes('status="409"'),
      );
    expect(boomLine).toBeDefined();
    expect(boomLine).toMatch(/}\s+1$/);
  });

  it('two independent PlatformMetricsService instances never collide (private registries)', async () => {
    // Boot a second, fully independent demo app in the same process — this
    // is exactly the scenario shared/go/platform/metrics.go's private
    // prometheus.NewRegistry() (instead of the default registerer) exists
    // to make safe, and it is exercised for real here rather than asserted
    // only in a comment.
    const secondApp = await bootstrapDemoApp();
    await request(secondApp.getHttpServer()).get('/ok').expect(200);

    const firstMetrics = await request(app.getHttpServer()).get('/metrics');
    const secondMetrics = await request(secondApp.getHttpServer()).get('/metrics');

    expect(firstMetrics.status).toBe(200);
    expect(secondMetrics.status).toBe(200);
    // Both processes' registries independently expose the same metric
    // family without throwing a duplicate-registration error — the
    // regression this test guards against.
    expect(secondMetrics.text).toContain('http_requests_total');

    await secondApp.close();
  });
});
