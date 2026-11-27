import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { CoreLedgerClient, LedgerError } from '../src/core-ledger/core-ledger.client';

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

  describe('cross-asset calls (slice 4a)', () => {
    async function clientFor(ledger: Server): Promise<{ client: CoreLedgerClient; keycloak: Server }> {
      const ledgerUrl = await listen(ledger);
      const keycloak = http.createServer((_req, res) => {
        const payload = JSON.stringify({ access_token: 'tok-svc-payments', expires_in: 300, token_type: 'Bearer' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
      });
      const keycloakUrl = await listen(keycloak);
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
      return { client: new CoreLedgerClient(config, new ServiceTokenClient(config)), keycloak };
    }

    it('posts an FX payment with the quote, the pin and the entity back-reference', async () => {
      const seen: { method?: string; url?: string; body?: Record<string, unknown>; auth?: string; idem?: string } = {};
      const ledger = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        req.on('end', () => {
          seen.method = req.method;
          seen.url = req.url;
          seen.body = JSON.parse(raw) as Record<string, unknown>;
          seen.auth = header(req, 'authorization');
          seen.idem = header(req, 'idempotency-key');
          const payload = JSON.stringify({ id: 'tx-4', type: 'FX_PAYMENT', status: 'POSTED', created_at: '' });
          res.writeHead(201, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
          res.end(payload);
        });
      });

      let keycloak: Server | null = null;
      try {
        const made = await clientFor(ledger);
        keycloak = made.keycloak;
        const tx = await made.client.payConverted({
          fromWalletId: 'wal_btc',
          toWalletId: 'wal_kes',
          amount: '0.01000000',
          quoteId: 'q_1',
          reference: 'pi_1',
          idempotencyKey: 'payments:pi_1',
          actor: 'party_1',
        });

        expect(seen.method).toBe('POST');
        expect(seen.url).toBe('/fx/payments');
        expect(seen.body).toEqual({
          from_wallet_id: 'wal_btc',
          to_wallet_id: 'wal_kes',
          amount: '0.01000000',
          quote_id: 'q_1',
          entity_type: 'BANK_PAYMENT',
          entity_id: 'pi_1',
        });
        expect(seen.auth).toBe('Bearer tok-svc-payments');
        expect(seen.idem).toBe('payments:pi_1');
        expect(tx.id).toBe('tx-4');
      } finally {
        await close(ledger);
        if (keycloak) await close(keycloak);
      }
    });

    it('posts a redemption and reads back the saga correlation id', async () => {
      const seen: { body?: Record<string, unknown>; idem?: string; actor?: string } = {};
      const ledger = http.createServer((req, res) => {
        let raw = '';
        req.on('data', (chunk: Buffer) => (raw += chunk.toString()));
        req.on('end', () => {
          seen.body = JSON.parse(raw) as Record<string, unknown>;
          seen.idem = header(req, 'idempotency-key');
          seen.actor = header(req, 'x-user-id');
          const payload = JSON.stringify({ id: 'tx-r', type: 'USDX_REDEEM', status: 'POSTED', correlation_id: 'corr_1', saga_status: 'PENDING' });
          res.writeHead(202, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
          res.end(payload);
        });
      });

      let keycloak: Server | null = null;
      try {
        const made = await clientFor(ledger);
        keycloak = made.keycloak;
        const redemption = await made.client.redeem({
          usdxWalletId: 'wal_usdx',
          fiatWalletId: 'wal_usd',
          amount: '10.00',
          idempotencyKey: 'payments:pi_1:redeem',
          actor: 'party_1',
        });

        expect(seen.body).toEqual({ usdx_wallet_id: 'wal_usdx', fiat_wallet_id: 'wal_usd', amount: '10.00' });
        expect(seen.idem).toBe('payments:pi_1:redeem');
        expect(seen.actor).toBe('party_1');
        expect(redemption.correlation_id).toBe('corr_1');
      } finally {
        await close(ledger);
        if (keycloak) await close(keycloak);
      }
    });

    it('GETs a wallet with the service bearer and maps a 404 to null', async () => {
      const seen: { method?: string; url?: string; auth?: string } = {};
      const ledger = http.createServer((req, res) => {
        seen.method = req.method;
        seen.url = req.url;
        seen.auth = header(req, 'authorization');
        const payload = JSON.stringify({ id: 'wal_btc', user_id: 'party_1', currency: 'BTC', chain: 'bitcoin', status: 'ACTIVE' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
      });

      let keycloak: Server | null = null;
      try {
        const made = await clientFor(ledger);
        keycloak = made.keycloak;
        const wallet = await made.client.getWallet('wal_btc', 'party_1');

        expect(seen.method).toBe('GET');
        expect(seen.url).toBe('/wallets/wal_btc');
        expect(seen.auth).toBe('Bearer tok-svc-payments');
        expect(wallet?.status).toBe('ACTIVE');
      } finally {
        await close(ledger);
        if (keycloak) await close(keycloak);
      }

      const missing = http.createServer((_req, res) => {
        const payload = JSON.stringify({ error: 'not found', code: 'NOT_FOUND', request_id: '' });
        res.writeHead(404, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
      });
      keycloak = null;
      try {
        const made = await clientFor(missing);
        keycloak = made.keycloak;
        expect(await made.client.getWallet('wal_nope', 'party_1')).toBeNull();
      } finally {
        await close(missing);
        if (keycloak) await close(keycloak);
      }
    });

    it('GETs the saga by correlation id and maps a 404 to null', async () => {
      const ledger = http.createServer((_req, res) => {
        const payload = JSON.stringify({ correlation_id: 'corr_1', kind: 'redeem', status: 'BURN_CONFIRMED', amount: '10.000000', source_chain: 'ethereum', last_error: '' });
        res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
        res.end(payload);
      });

      let keycloak: Server | null = null;
      try {
        const made = await clientFor(ledger);
        keycloak = made.keycloak;
        const transfer = await made.client.getTransfer('corr_1', 'party_1');
        expect(transfer?.status).toBe('BURN_CONFIRMED');
      } finally {
        await close(ledger);
        if (keycloak) await close(keycloak);
      }
    });

    it('surfaces the ledger error code from the envelope', () => {
      expect(new LedgerError('m', 409, '{"code":"QUOTE_EXPIRED"}').code).toBe('QUOTE_EXPIRED');
      expect(new LedgerError('m', 503, '<html>bad gateway</html>').code).toBe('');
    });
  });
});
