import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { HttpException } from '@nestjs/common';
import { ServiceTokenClient } from '../src';

/**
 * The client-credentials contract against a fake token endpoint: caching,
 * the 30s headroom, single-flight refresh, and the two failure modes typed
 * the way every service's core-ledger client depends on.
 */

interface GrantState {
  grants: number;
  token: string;
  expiresIn: number;
  failNext?: number;
}

async function startFakeKeycloak(state: GrantState): Promise<{ url: string; close: () => Promise<void> }> {
  const server: Server = http.createServer((req, res) => {
    if (req.method !== 'POST' || req.url !== '/realms/damp/protocol/openid-connect/token') {
      res.writeHead(404).end();
      return;
    }
    if (state.failNext !== undefined) {
      res.writeHead(state.failNext, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'access_denied', error_description: 'Invalid client credentials' }));
      state.failNext = undefined;
      return;
    }
    state.grants += 1;
    const body = JSON.stringify({ access_token: state.token, expires_in: state.expiresIn, token_type: 'Bearer' });
    res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
    res.end(body);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

function clientFor(baseUrl: string): ServiceTokenClient {
  const config = {
    get: (key: string) =>
      ({
        KEYCLOAK_BASE_URL: baseUrl,
        KEYCLOAK_REALM: 'damp',
        SERVICE_CLIENT_ID: 'svc-bff',
        SERVICE_CLIENT_SECRET: 'dev-svc-bff-secret',
      })[key],
  } as unknown as ConfigService;
  return new ServiceTokenClient(config);
}

async function rejectedWithCode(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof HttpException) {
      const response = err.getResponse() as { code?: string };
      return response.code ?? '';
    }
    throw err;
  }
  throw new Error('expected the promise to reject');
}

describe('ServiceTokenClient', () => {
  it('mints a token with client credentials and caches it until 30s before expiry', async () => {
    const state: GrantState = { grants: 0, token: 'tok-1', expiresIn: 300 };
    const kc = await startFakeKeycloak(state);
    try {
      const client = clientFor(kc.url);

      expect(await client.accessToken()).toBe('tok-1');
      expect(await client.accessToken()).toBe('tok-1');
      expect(state.grants).toBe(1); // second call served from cache
    } finally {
      await kc.close();
    }
  });

  it('single-flights concurrent refreshes into one grant', async () => {
    const state: GrantState = { grants: 0, token: 'tok-1', expiresIn: 300 };
    const kc = await startFakeKeycloak(state);
    try {
      const client = clientFor(kc.url);

      const tokens = await Promise.all([client.accessToken(), client.accessToken(), client.accessToken()]);
      expect(tokens).toEqual(['tok-1', 'tok-1', 'tok-1']);
      expect(state.grants).toBe(1);
    } finally {
      await kc.close();
    }
  });

  it('refreshes when the cached token is inside the 30s headroom', async () => {
    const state: GrantState = { grants: 0, token: 'tok-1', expiresIn: 1 }; // expires ~now + 1s < headroom
    const kc = await startFakeKeycloak(state);
    try {
      const client = clientFor(kc.url);
      expect(await client.accessToken()).toBe('tok-1');
      state.token = 'tok-2';
      expect(await client.accessToken()).toBe('tok-2');
      expect(state.grants).toBe(2);
    } finally {
      await kc.close();
    }
  });

  it('a refused grant throws KEYCLOAK_AUTH_FAILED and does not poison the cache', async () => {
    const state: GrantState = { grants: 0, token: 'tok-1', expiresIn: 300, failNext: 401 };
    const kc = await startFakeKeycloak(state);
    try {
      const client = clientFor(kc.url);

      await expect(rejectedWithCode(client.accessToken())).resolves.toBe('KEYCLOAK_AUTH_FAILED');
      // The next call retries the grant instead of replaying the failure —
      // one successful grant total (the refused one never counted).
      expect(await client.accessToken()).toBe('tok-1');
      expect(state.grants).toBe(1);
    } finally {
      await kc.close();
    }
  });

  it('an unreachable keycloak throws KEYCLOAK_UNREACHABLE', async () => {
    const client = clientFor('http://127.0.0.1:1'); // nothing listens there
    await expect(rejectedWithCode(client.accessToken())).resolves.toBe('KEYCLOAK_UNREACHABLE');
  });
});
