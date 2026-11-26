import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';

/**
 * H2: kyc's wallet freeze/thaw calls to core-ledger must carry kyc's own
 * service-account bearer (svc-kyc, ledger.wallet-status) on both the wallet
 * list and the status write.
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

describe('CoreLedgerClient service-account auth', () => {
  it('attaches the svc-kyc bearer on wallet list and status write', async () => {
    const seen: { listAuth?: string; statusAuth?: string; actor?: string } = {};

    const ledger = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://internal');
      if (req.method === 'GET' && url.pathname === '/users/party_1/wallets') {
        seen.listAuth = header(req, 'authorization');
        seen.actor = header(req, 'x-user-id');
        const payload = JSON.stringify({ wallets: [{ id: 'wal_1', status: 'ACTIVE' }] });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/wallets/wal_1/status') {
        seen.statusAuth = header(req, 'authorization');
        const payload = JSON.stringify({ id: 'wal_1', status: 'FROZEN' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
        return;
      }
      res.writeHead(404).end();
    });
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok-svc-kyc', expires_in: 300, token_type: 'Bearer' });
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
            SERVICE_CLIENT_ID: 'svc-kyc',
            SERVICE_CLIENT_SECRET: 'dev-svc-kyc-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      await client.setWalletsFrozen('party_1');

      expect(seen.listAuth).toBe('Bearer tok-svc-kyc');
      expect(seen.statusAuth).toBe('Bearer tok-svc-kyc');
      expect(seen.actor).toBe('kyc');
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });
});
