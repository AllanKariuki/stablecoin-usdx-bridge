import request from 'supertest';
import { bootstrapIdentityApp } from './fixtures/bootstrap';

/**
 * The relay's metrics must land on the registry /metrics serves. An
 * @Optional() PlatformMetricsService that Nest cannot see resolves to
 * undefined without a word, and the backlog gauge — the only alarm for an
 * audit-trail that has stopped accepting — silently never exists.
 */
describe('audit relay metrics', () => {
  it('registers audit_outbox_* on the service registry', async () => {
    process.env.AUDIT_TRAIL_URL = 'http://127.0.0.1:9';
    const app = await bootstrapIdentityApp('http://127.0.0.1:9', 'http://127.0.0.1:9');
    try {
      const res = await request(app.getHttpServer()).get('/metrics').expect(200);
      expect(res.text).toContain('audit_outbox_pending_events');
    } finally {
      delete process.env.AUDIT_TRAIL_URL;
      await app.close();
    }
  });
});
