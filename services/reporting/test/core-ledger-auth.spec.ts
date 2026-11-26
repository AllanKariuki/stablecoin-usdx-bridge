import http, { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { ConfigService } from '@nestjs/config';
import { Queryable, ServiceTokenClient } from '@damp/nest-platform';
import { DbService } from '../src/db/db.service';
import { ReportsService } from '../src/reports/reports.service';

/**
 * H2: a report run that assembles its figures from core-ledger must carry
 * reporting's own service-account bearer (svc-reporting,
 * ledger.reports.read) on the core-ledger HTTP call.
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

const DEFINITION_ROW = {
  id: 'def_tb',
  name: 'Trial balance',
  kind: 'TRIAL_BALANCE',
  description: '',
  params: {},
  required_permission: 'reports:read',
};

const RUN_ROW = {
  id: 'run_1',
  definition_id: 'def_tb',
  kind: 'TRIAL_BALANCE',
  params: {},
  requested_by: 'auditor-1',
  status: 'COMPLETE',
  result: null,
  row_count: 0,
  result_hash: '',
  error: null,
  created_at: '2026-01-01T00:00:00Z',
  finished_at: null,
};

/** A Queryable that answers every query run() issues, recording nothing. */
const fakeDb: Queryable = {
  query: async (text: string) => {
    if (text.includes('FROM report_definitions')) return { rows: [DEFINITION_ROW] };
    if (text.includes('FROM report_runs')) return { rows: [RUN_ROW] };
    return { rows: [] };
  },
};

const fakeDbService = {
  query: fakeDb.query,
  transaction: async (fn: (q: Queryable) => Promise<unknown>) => fn(fakeDb),
} as unknown as DbService;

describe('ReportsService -> core-ledger authorization', () => {
  it('attaches the svc-reporting bearer on the trial-balance call', async () => {
    const seen: { auth?: string; actor?: string } = {};

    const ledger = http.createServer((req, res) => {
      seen.auth = header(req, 'authorization');
      seen.actor = header(req, 'x-user-id');
      const payload = JSON.stringify({
        currency: 'USD',
        as_of: '2026-01-01',
        balanced: true,
        total_debits: '0.00',
        total_credits: '0.00',
        lines: [],
      });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    const ledgerUrl = await listen(ledger);

    const keycloak = http.createServer((_req, res) => {
      const payload = JSON.stringify({ access_token: 'tok-svc-reporting', expires_in: 300, token_type: 'Bearer' });
      res.writeHead(200, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) });
      res.end(payload);
    });
    const keycloakUrl = await listen(keycloak);

    try {
      const config = {
        get: (key: string) =>
          ({
            CORE_LEDGER_URL: ledgerUrl,
            AUDIT_TRAIL_URL: '',
            KEYCLOAK_BASE_URL: keycloakUrl,
            KEYCLOAK_REALM: 'damp',
            SERVICE_CLIENT_ID: 'svc-reporting',
            SERVICE_CLIENT_SECRET: 'dev-svc-reporting-secret',
          })[key],
      } as unknown as ConfigService;

      const service = new ReportsService(fakeDbService, config, new ServiceTokenClient(config));
      await service.run('def_tb', { currency: 'USD' }, 'auditor-1');

      expect(seen.auth).toBe('Bearer tok-svc-reporting');
      expect(seen.actor).toBe('reporting');
    } finally {
      await close(ledger);
      await close(keycloak);
    }
  });
});
