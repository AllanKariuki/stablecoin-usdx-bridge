import { ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AUDIT } from '../src/audit/audit-actions';
import { DbService } from '../src/db/db.service';
import { ReportsController } from '../src/reports/reports.controller';
import { ReportsService } from '../src/reports/reports.service';
import { SupersetService } from '../src/superset/superset.service';

/**
 * Real Postgres, in reporting_test (infra/postgres/init/06-p7-databases.sql).
 * audit-trail's read API and Superset are stand-ins; what is under test is
 * that each run, export and guest token is on the record — and that nothing
 * leaves this service when it could not be.
 *
 *   REPORTING_TEST_DATABASE_URL=postgres://reporting:reporting@localhost:55433/reporting_test?sslmode=disable \
 *     pnpm --filter @damp/reporting test
 */
const TEST_DATABASE_URL =
  process.env.REPORTING_TEST_DATABASE_URL ??
  'postgres://reporting:reporting@localhost:55433/reporting_test?sslmode=disable';

const settings: Record<string, string> = {
  DATABASE_URL: TEST_DATABASE_URL,
  CORE_LEDGER_URL: 'http://core-ledger.invalid',
  AUDIT_TRAIL_URL: 'http://audit-trail.invalid',
};
const config = { get: (k: string) => settings[k] } as unknown as ConfigService;

describe('reporting audit producer (real Postgres)', () => {
  let db: DbService;
  let reports: ReportsService;
  let superset: { guestToken: jest.Mock };
  let controller: ReportsController;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    db = new DbService(config);
    await db.onModuleInit();
    reports = new ReportsService(db, config);
    superset = { guestToken: jest.fn() };
    controller = new ReportsController(reports, superset as unknown as SupersetService, db);
  });

  beforeEach(() => {
    // The audit extract's one upstream call.
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify({ events: [{ actor: 'a', action: 'x' }] }), { status: 200 }));
  });

  afterEach(() => fetchSpy.mockRestore());

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  async function auditFor(subjectId: string) {
    const { rows } = await db.query<{ action: string; payload: Record<string, unknown> }>(
      `SELECT action, payload FROM audit_outbox WHERE payload->>'subject_id' = $1 ORDER BY id`,
      [subjectId],
    );
    return rows;
  }

  function response() {
    const headers: Record<string, string> = {};
    return {
      headers,
      body: '',
      setHeader(k: string, v: string) {
        headers[k] = v;
      },
      send(b: string) {
        this.body = b;
      },
    };
  }

  it('audits a run with its result hash, and the export of it with who took it', async () => {
    const run = await controller.runReport('analyst-1', 'rpt_audit', { limit: 5 }, { requestId: 'gw-rep-1' });
    expect(run.status).toBe('COMPLETE');

    const res = response();
    await controller.exportCsv('auditor-7', run.id, res as never, { sourceIp: '203.0.113.50' });
    expect(res.body).not.toBe('');

    const events = await auditFor(run.id);
    expect(events.map((e) => [e.action, e.payload.actor])).toEqual([
      [AUDIT.reportRun, 'analyst-1'],
      [AUDIT.reportExported, 'auditor-7'],
    ]);
    expect(events[0].payload).toMatchObject({
      request_id: 'gw-rep-1',
      after_state: { status: 'COMPLETE', rowCount: 1, resultHash: run.resultHash },
      metadata: { kind: 'AUDIT_EXTRACT', params: { limit: 5 } },
    });
    expect(events[1].payload).toMatchObject({ source_ip: '203.0.113.50', metadata: { resultHash: run.resultHash } });
  });

  it('audits a failed run as a FAILURE', async () => {
    fetchSpy.mockResolvedValue(new Response('down', { status: 503 }));
    const run = await controller.runReport('analyst-2', 'rpt_audit', {});
    expect(run.status).toBe('FAILED');
    expect((await auditFor(run.id)).map((e) => e.payload.outcome)).toEqual(['FAILURE']);
  });

  it('serves no export when its audit event cannot be written', async () => {
    const run = await controller.runReport('analyst-3', 'rpt_audit', {});
    const res = response();
    // An actor audit-trail would refuse makes the enqueue throw.
    await expect(controller.exportCsv('', run.id, res as never)).rejects.toThrow();
    expect(res.body).toBe('');
    expect((await auditFor(run.id)).map((e) => e.action)).toEqual([AUDIT.reportRun]);
  });

  it('audits a guest token issued, and one refused by row-level security, but not Superset being down', async () => {
    const dashboard = `dash_${Date.now()}`;
    superset.guestToken
      .mockResolvedValueOnce({ token: 't', supersetUrl: 'http://superset', expiresInSeconds: 300 })
      .mockRejectedValueOnce(new ForbiddenException('no permission'))
      .mockRejectedValueOnce(new ServiceUnavailableException('superset down'));

    await controller.guestToken('party_1', ['transactions:read:own'], dashboard);
    await expect(controller.guestToken('party_2', [], dashboard)).rejects.toThrow(ForbiddenException);
    await expect(controller.guestToken('party_3', ['reports:read'], dashboard)).rejects.toThrow(
      ServiceUnavailableException,
    );

    const events = await auditFor(dashboard);
    expect(events.map((e) => [e.action, e.payload.actor, e.payload.outcome])).toEqual([
      [AUDIT.guestTokenIssued, 'party_1', 'SUCCESS'],
      [AUDIT.guestTokenRefused, 'party_2', 'DENIED'],
    ]);
    expect(events[0].payload).toMatchObject({ metadata: { permissions: ['transactions:read:own'] } });
  });
});
