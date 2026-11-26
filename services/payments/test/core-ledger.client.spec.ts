import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';

/**
 * H2: every settlement write payments posts to core-ledger must carry
 * payments' own service-account bearer (minted through the shared
 * ServiceTokenClient) alongside the X-User-Id that names the party — over a
 * real HTTP connection, so the assertion is about the actual wire shape.
 */

async function listen(server: Server): Promise<string> {
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

function close(server: Server): Promise<void> {
  return new Promise((resolve, reject) => server.close((err) => (err ? reject(err) : resolve())));
}

function header(req: http.IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

const TX = { id: 'tx-1', type: 'FIAT_DEPOSIT', status: 'POSTED', created_at: '2026-01-01T00:00:00Z' };

describe('CoreLedgerClient service-account auth', () => {
  it('attaches the svc-payments bearer and X-User-Id on every write', async () => {
    const seen: { auth?: string; actor?: string; idempotencyKey?: string; serviceToken?: string } = {};

    const ledger = http.createServer((req, res) => {
      seen.auth = header(req, 'authorization');
      seen.actor = header(req, 'x-user-id');
      seen.serviceToken = header(req, 'x-service-token');
      seen.idempotencyKey = header(req, 'idempotency-key');
      const payload = JSON.stringify(TX);
      res.writeHead(201, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok-svc-payments', expires_in: 300, token_type: 'Bearer' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    const keycloakUrl = await listen(keycloak);

    try {
      const config = {
        get: (key: string) =>
          ({
            CORE_LEDGER_URL: ledgerUrl,
            KEYCLOAK_BASE_URL: keycloakUrl,
            KEYCLOAK_REALM: 'damp',
            SERVICE_CLIENT_ID: 'svc-payments',
            SERVICE_CLIENT_SECRET: 'dev-svc-payments-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      await client.deposit({
        walletId: 'wal_1',
        amount: '25.00',
        reference: 'pi_1',
        idempotencyKey: 'key-1',
        actor: 'party_1',
      });

      expect(seen.auth).toBe('Bearer tok-svc-payments');
      expect(seen.actor).toBe('party_1');
      expect(seen.idempotencyKey).toBe('key-1');
      // The pre-H2 X-Service-Token plumbing is gone, not just unused.
      expect(seen.serviceToken).toBeUndefined();
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });

  it('attaches the bearer on ensureWallet too', async () => {
    const seen: { auth?: string } = {};
    const ledger = http.createServer((req, res) => {
      seen.auth = header(req, 'authorization');
      const payload = JSON.stringify({
        id: 'wal_2',
        user_id: 'party_2',
        currency: 'USD',
        chain: '',
        balance: '0.00',
      });
      res.writeHead(201, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok-svc-payments', expires_in: 300, token_type: 'Bearer' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    const keycloakUrl = await listen(keycloak);

    try {
      const config = {
        get: (key: string) =>
          ({
            CORE_LEDGER_URL: ledgerUrl,
            KEYCLOAK_BASE_URL: keycloakUrl,
            KEYCLOAK_REALM: 'damp',
            SERVICE_CLIENT_ID: 'svc-payments',
            SERVICE_CLIENT_SECRET: 'dev-svc-payments-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      await client.ensureWallet('party_2', 'USD');

      expect(seen.auth).toBe('Bearer tok-svc-payments');
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });
});
