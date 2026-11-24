import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';

/**
 * H2: compliance's wallet freeze/thaw calls to core-ledger must carry
 * compliance's own service-account bearer (svc-compliance,
 * ledger.wallet-status) on both the wallet list and the status write.
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
  it('attaches the svc-compliance bearer on wallet list and status write', async () => {
    const seen: { listAuth?: string; statusAuth?: string; actor?: string } = {};

    const ledger = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://internal');
      if (req.method === 'GET' && url.pathname === '/users/party_1/wallets') {
        seen.listAuth = header(req, 'authorization');
        seen.actor = header(req, 'x-user-id');
        const payload = JSON.stringify({ wallets: [{ id: 'wal_1' }] });
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
      const payload = JSON.stringify({ access_token: 'tok-svc-compliance', expires_in: 300, token_type: 'Bearer' });
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
            SERVICE_CLIENT_ID: 'svc-compliance',
            SERVICE_CLIENT_SECRET: 'dev-svc-compliance-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      await client.setWalletsStatus('party_1', 'FROZEN');

      expect(seen.listAuth).toBe('Bearer tok-svc-compliance');
      expect(seen.statusAuth).toBe('Bearer tok-svc-compliance');
      expect(seen.actor).toBe('compliance');
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });
});

describe('CoreLedgerClient enforcement submissions (H6)', () => {
  it('maps a 202 to SUBMITTED and a 200 FINAL to FINAL, with the svc-compliance bearer and the action id as the idempotency key', async () => {
    const seen: { path?: string; auth?: string; idem?: string; body?: string } = {};

    const ledger = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://internal');
      if (req.method === 'POST' && url.pathname === '/chain/enforcement') {
        let raw = '';
        req.on('data', (c) => (raw += c));
        req.on('end', () => {
          seen.path = url.pathname;
          seen.auth = header(req, 'authorization');
          seen.idem = header(req, 'idempotency-key');
          seen.body = raw;
          // First call: broadcast (202 SUBMITTED). The server flips to the
          // terminal state for the second call.
          if (!submitted) {
            submitted = true;
            const payload = JSON.stringify({ reference: 'enf_1', status: 'SUBMITTED', tx_hash: '0xabc' });
            res.writeHead(202, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
            res.end(payload);
            return;
          }
          const payload = JSON.stringify({ reference: 'enf_1', status: 'FINAL', tx_hash: '0xabc' });
          res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
          res.end(payload);
        });
        return;
      }
      res.writeHead(404).end();
    });
    let submitted = false;
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok-svc-compliance', expires_in: 300, token_type: 'Bearer' });
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
            SERVICE_CLIENT_ID: 'svc-compliance',
            SERVICE_CLIENT_SECRET: 'dev-svc-compliance-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      const input = {
        action: 'BLACKLIST' as const,
        chain: 'ETHEREUM',
        address: '0x00000000000000000000000000000000000000E1',
        reference: 'enf_1',
      };

      const first = await client.enforce(input);
      expect(first).toEqual({ status: 'SUBMITTED', txHash: '0xabc' });

      const retried = await client.enforce(input);
      expect(retried).toEqual({ status: 'FINAL', txHash: '0xabc' });

      expect(seen.path).toBe('/chain/enforcement');
      expect(seen.auth).toBe('Bearer tok-svc-compliance');
      expect(seen.idem).toBe('enforcement:enf_1');
      expect(JSON.parse(seen.body ?? '{}')).toEqual({
        action: 'BLACKLIST',
        chain: 'ETHEREUM',
        address: '0x00000000000000000000000000000000000000E1',
        reference: 'enf_1',
      });
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });

  it('maps a 409 to a terminal failure and a 502 to a retryable one', async () => {
    const ledger = http.createServer((req, res) => {
      if (req.method === 'POST' && new URL(req.url ?? '/', 'http://internal').pathname === '/chain/enforcement') {
        const payload = JSON.stringify({ error: 'execution reverted', code: 'CHAIN_REJECTED' });
        res.writeHead(409, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
        return;
      }
      res.writeHead(404).end();
    });
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok', expires_in: 300, token_type: 'Bearer' });
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
            SERVICE_CLIENT_ID: 'svc-compliance',
            SERVICE_CLIENT_SECRET: 'dev-svc-compliance-secret',
          })[key],
      } as unknown as ConfigService;

      const client = new CoreLedgerClient(config, new ServiceTokenClient(config));
      const input = { action: 'PAUSE' as const, chain: 'ETHEREUM', reference: 'enf_2' };

      const terminal = await client.enforce(input);
      expect(terminal).toMatchObject({ status: 'TERMINAL_FAILED' });
      expect((terminal as { reason: string }).reason).toContain('execution reverted');

      await new Promise<void>((resolve) => ledger.close(() => resolve()));
      const unavailable = http.createServer((req, res) => {
        if (req.method === 'POST' && new URL(req.url ?? '/', 'http://internal').pathname === '/chain/enforcement') {
          const payload = JSON.stringify({ error: 'chain hiccup', code: 'CHAIN_UNAVAILABLE' });
          res.writeHead(502, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
          res.end(payload);
          return;
        }
        res.writeHead(404).end();
      });
      const unavailableUrl = await listen(unavailable);
      try {
        const config2 = {
          get: (key: string) =>
            ({
              CORE_LEDGER_URL: unavailableUrl,
              KEYCLOAK_BASE_URL: keycloakUrl,
              KEYCLOAK_REALM: 'damp',
              SERVICE_CLIENT_ID: 'svc-compliance',
              SERVICE_CLIENT_SECRET: 'dev-svc-compliance-secret',
            })[key],
        } as unknown as ConfigService;
        const client2 = new CoreLedgerClient(config2, new ServiceTokenClient(config2));
        const transient = await client2.enforce(input);
        expect(transient).toMatchObject({ status: 'TRANSIENT' });
        expect((transient as { reason: string }).reason).toContain('chain hiccup');
      } finally {
        await close(unavailable);
      }
    } finally {
      await close(keycloak);
    }
  });
});
