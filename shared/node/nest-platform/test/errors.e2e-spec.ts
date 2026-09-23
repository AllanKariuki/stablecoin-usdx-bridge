import { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { REQUEST_ID_HEADER } from '../src/constants';
import { bootstrapDemoApp, clearDemoEnv, setValidDemoEnv } from './fixtures/bootstrap';

describe('{error, code, request_id} envelope (e2e)', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    setValidDemoEnv();
    app = await bootstrapDemoApp();
  });

  afterAll(async () => {
    await app.close();
    clearDemoEnv();
  });

  it('a PlatformException carries its custom code through the envelope', async () => {
    const res = await request(app.getHttpServer()).get('/boom');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'wallet is frozen', code: 'ACCOUNT_FROZEN' });
    expect(typeof res.body.request_id).toBe('string');
    expect(res.body.request_id.length).toBeGreaterThan(0);
  });

  it('a built-in NotFoundException maps to the generic NOT_FOUND code', async () => {
    const res = await request(app.getHttpServer()).get('/missing');
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ error: 'wallet not found', code: 'NOT_FOUND' });
    expect(res.body.request_id).toBeTruthy();
  });

  it('an unmatched route still produces the envelope, not Nest/Express\'s default 404 page', async () => {
    const res = await request(app.getHttpServer()).get('/this-route-does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('NOT_FOUND');
    expect(res.body.request_id).toBeTruthy();
  });

  it('a raw thrown Error (not an HttpException) falls back to 500/INTERNAL/"internal error"', async () => {
    const res = await request(app.getHttpServer()).get('/crash');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      error: 'internal error',
      code: 'INTERNAL',
      request_id: expect.any(String),
    });
  });

  it('propagates an inbound x-request-id instead of minting a new one', async () => {
    const res = await request(app.getHttpServer()).get('/boom').set(REQUEST_ID_HEADER, 'test-fixed-id-123');
    expect(res.headers[REQUEST_ID_HEADER]).toBe('test-fixed-id-123');
    expect(res.body.request_id).toBe('test-fixed-id-123');
  });

  it('generates a fresh request id when none is supplied, differing per request', async () => {
    const res1 = await request(app.getHttpServer()).get('/ok');
    const res2 = await request(app.getHttpServer()).get('/ok');
    expect(res1.headers[REQUEST_ID_HEADER]).toBeTruthy();
    expect(res2.headers[REQUEST_ID_HEADER]).toBeTruthy();
    expect(res1.headers[REQUEST_ID_HEADER]).not.toBe(res2.headers[REQUEST_ID_HEADER]);
  });
});
