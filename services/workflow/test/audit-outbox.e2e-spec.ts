import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRelay, enqueueAuditEvent, HttpAuditPublisher } from '@damp/nest-platform';
import { createServer, Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { randomUUID } from 'node:crypto';
import { DbService } from '../src/db/db.service';
import { AUDIT, RequestsService } from '../src/requests/requests.service';

/**
 * Real Postgres, in workflow_test — never the dev database. The guarantees
 * under test are database properties: that a decision and its audit event
 * commit or roll back together, and that the row lock serialises deciders.
 *
 *   docker compose up -d postgres
 *   WORKFLOW_TEST_DATABASE_URL=postgres://workflow:workflow@localhost:55433/workflow_test?sslmode=disable \
 *     pnpm --filter @damp/workflow test
 */
const TEST_DATABASE_URL =
  process.env.WORKFLOW_TEST_DATABASE_URL ??
  'postgres://workflow:workflow@localhost:55433/workflow_test?sslmode=disable';

describe('workflow audit producer (real Postgres)', () => {
  let db: DbService;
  let requests: RequestsService;

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    requests = new RequestsService(db);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  async function auditFor(subjectId: string) {
    const { rows } = await db.query<{ action: string; payload: Record<string, any> }>(
      `SELECT action, payload FROM audit_outbox WHERE payload->>'subject_id' = $1 ORDER BY id`,
      [subjectId],
    );
    return rows;
  }

  function proposeClosure(requestedBy = 'maker-1') {
    return requests.propose({
      action: 'ledger.closure',
      subjectType: 'LEDGER_CLOSURE',
      subjectId: `clo_${randomUUID()}`,
      payload: { month: '2026-10', nonce: randomUUID() },
      requestedBy,
      requestedByRoles: ['treasury'],
      reason: 'month end',
      audit: { requestId: 'gw-req-1', sourceIp: '203.0.113.5', roles: ['treasury'] },
    });
  }

  it('audits a proposal once, even when it is re-submitted', async () => {
    const subjectId = `clo_${randomUUID()}`;
    const input = {
      action: 'ledger.closure',
      subjectType: 'LEDGER_CLOSURE',
      subjectId,
      payload: { month: '2026-09' },
      requestedBy: 'maker-1',
      requestedByRoles: ['treasury'],
    };
    const first = await requests.propose(input);
    const second = await requests.propose(input);
    expect(second.id).toBe(first.id);

    const events = await auditFor(first.id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.proposed]);
    expect(events[0].payload.actor).toBe('maker-1');
    expect(events[0].payload.metadata.payloadDigest).toBe(first.payloadDigest);
  });

  it('records every approver of a two-of-two policy, each in the decision transaction', async () => {
    const req = await proposeClosure();
    await requests.decide({ requestId: req.id, decision: 'APPROVE', decidedBy: 'checker-1', decidedByRoles: ['treasury'] });
    const done = await requests.decide({
      requestId: req.id,
      decision: 'APPROVE',
      decidedBy: 'checker-2',
      decidedByRoles: ['treasury'],
      audit: { requestId: 'gw-req-2', roles: ['treasury'] },
    });
    expect(done.status).toBe('APPROVED');

    const events = await auditFor(req.id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.proposed, AUDIT.approved, AUDIT.approved]);
    expect(events[1].payload.after_state).toMatchObject({ status: 'PENDING', approvals: 1, approvalsRequired: 2 });
    expect(events[2].payload).toMatchObject({
      actor: 'checker-2',
      request_id: 'gw-req-2',
      actor_roles: ['treasury'],
      after_state: { status: 'APPROVED', approvals: 2 },
    });
  });

  it('refuses self-approval and audits the attempt as DENIED, with no approval written', async () => {
    const req = await proposeClosure('maker-9');
    await expect(
      requests.decide({ requestId: req.id, decision: 'APPROVE', decidedBy: 'maker-9', decidedByRoles: ['treasury'] }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    const events = await auditFor(req.id);
    expect(events.map((e) => [e.action, e.payload.outcome])).toEqual([
      [AUDIT.proposed, 'SUCCESS'],
      [AUDIT.approved, 'DENIED'],
    ]);
    const { rows } = await db.query('SELECT 1 FROM approvals WHERE request_id = $1', [req.id]);
    expect(rows).toHaveLength(0);
  });

  it('refuses a second decision by the same person without auditing it as a decision', async () => {
    const req = await proposeClosure();
    await requests.decide({ requestId: req.id, decision: 'APPROVE', decidedBy: 'checker-1', decidedByRoles: ['treasury'] });
    await expect(
      requests.decide({ requestId: req.id, decision: 'APPROVE', decidedBy: 'checker-1', decidedByRoles: ['treasury'] }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect((await auditFor(req.id)).map((e) => e.action)).toEqual([AUDIT.proposed, AUDIT.approved]);
  });

  it('audits a rejection and a cancellation', async () => {
    const rejected = await proposeClosure();
    await requests.decide({ requestId: rejected.id, decision: 'REJECT', decidedBy: 'checker-1', decidedByRoles: ['treasury'] });
    const rej = await auditFor(rejected.id);
    expect(rej[1]).toMatchObject({ action: AUDIT.rejected, payload: { after_state: { status: 'REJECTED' } } });

    const cancelled = await proposeClosure('maker-2');
    await requests.cancel(cancelled.id, 'maker-2');
    const can = await auditFor(cancelled.id);
    expect(can[1]).toMatchObject({ action: AUDIT.cancelled, payload: { actor: 'maker-2' } });
  });

  it('rolls the audit event back with the transaction it was written in', async () => {
    const subjectId = `probe_${randomUUID()}`;
    await expect(
      db.transaction(async (client) => {
        await enqueueAuditEvent(client, { actor: 'a', action: 'workflow.test.probe', service: 'workflow', subjectId });
        throw new Error('the action failed after its event was written');
      }),
    ).rejects.toThrow('the action failed');
    expect(await auditFor(subjectId)).toHaveLength(0);
  });

  describe('relay', () => {
    let server: Server;
    let baseUrl: string;
    const recorded = new Map<string, number>();
    let failFirst = true;

    beforeAll(async () => {
      // A stand-in audit-trail that dedupes on id the way the real one does,
      // and "loses" its first acknowledgement after recording.
      server = createServer((req, res) => {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
          const { id } = JSON.parse(body);
          if (recorded.has(id)) {
            res.writeHead(200).end();
            return;
          }
          recorded.set(id, 1);
          if (failFirst) {
            failFirst = false;
            res.writeHead(502).end();
            return;
          }
          res.writeHead(201).end();
        });
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    });

    afterAll(async () => {
      await new Promise((resolve) => server.close(resolve));
    });

    it('delivers every pending event, and a redelivery is recorded once', async () => {
      // Drain whatever earlier runs and tests left, so this test is about
      // the one event it writes.
      await db.query(`UPDATE audit_outbox SET status = 'DELIVERED' WHERE status = 'PENDING'`);
      const subjectId = `probe_${randomUUID()}`;
      const id = await db.transaction((client) =>
        enqueueAuditEvent(client, { actor: 'a', action: 'workflow.test.relay', service: 'workflow', subjectId }),
      );

      const quiet = { log: () => undefined, warn: () => undefined, error: () => undefined };
      const relay = new AuditRelay(db, new HttpAuditPublisher(baseUrl), quiet, { backoffMinMs: 1, backoffMaxMs: 1 });

      expect(await relay.runOnce()).toBe(0); // recorded, but the 502 says otherwise
      await new Promise((r) => setTimeout(r, 20));
      expect(await relay.runOnce()).toBe(1); // redelivered; the trail answers 200

      expect(recorded.get(id)).toBe(1);
      const { rows } = await db.query<{ status: string; attempts: number }>(
        'SELECT status, attempts FROM audit_outbox WHERE event_id = $1',
        [id],
      );
      expect(rows[0]).toEqual({ status: 'DELIVERED', attempts: 2 });
    });
  });
});
