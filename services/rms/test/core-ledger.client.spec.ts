import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';

/**
 * H2: rms' reads and writes to core-ledger must carry rms' own
 * service-account bearer (svc-rms, ledger.reserves.custodian).
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

const STATUS = {
  currency: 'USD',
  issued: '100.000000',
  in_transit: '0',
  backing: '100.00',
  ledger_cash: '100.00',
  chains: {},
  custodian: null,
  open_breaks: [],
  last_run: null,
};

describe('CoreLedgerClient service-account auth', () => {
  it('attaches the svc-rms bearer on the status read and the snapshot write', async () => {
    const seen: { readAuth?: string; writeAuth?: string; serviceToken?: string; actor?: string } = {};

    const ledger = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://internal');
      if (req.method === 'GET' && url.pathname === '/reserves/status') {
        seen.readAuth = header(req, 'authorization');
        seen.serviceToken = header(req, 'x-service-token');
        seen.actor = header(req, 'x-user-id');
        const payload = JSON.stringify(STATUS);
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/reserves/custodian-snapshots') {
        seen.writeAuth = header(req, 'authorization');
        const payload = JSON.stringify({ ok: true });
        res.writeHead(201, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
        return;
      }
      res.writeHead(404).end();
    });
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok-svc-rms', expires_in: 300, token_type: 'Bearer' });
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
            SERVICE_CLIENT_ID: 'svc-rms',
            SERVICE_CLIENT_SECRET: 'dev-svc-rms-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      await client.reserveStatus();
      await client.postCustodianSnapshot({
        custodianId: 'primary',
        currency: 'USD',
        balance: '100.00',
        asOf: new Date('2026-01-01T00:00:00Z'),
        statementRef: 'stmt-1',
      });

      expect(seen.readAuth).toBe('Bearer tok-svc-rms');
      expect(seen.writeAuth).toBe('Bearer tok-svc-rms');
      expect(seen.actor).toBe('rms');
      // The pre-H2 X-Service-Token plumbing is gone, not just unused.
      expect(seen.serviceToken).toBeUndefined();
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });
});
