import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AttestationsController } from '../src/attestations/attestations.controller';
import { AUDIT } from '../src/audit/audit-actions';
import { CoreLedgerClient, ReserveStatus } from '../src/core-ledger/core-ledger.client';
import { CustodiansController } from '../src/custodians/custodians.controller';
import { CustodiansRepository } from '../src/custodians/custodians.repository';
import { CustodiansService } from '../src/custodians/custodians.service';
import { DbService } from '../src/db/db.service';
import { ReserveTargetsRepository } from '../src/reserves/reserve-targets.repository';
import { ReservesController } from '../src/reserves/reserves.controller';

/**
 * Real Postgres, in rms_test (infra/postgres/init/02-p3-databases.sql).
 * core-ledger is a stand-in; what is under test is that every change to a
 * reconciliation input commits or rolls back with its audit event.
 *
 *   RMS_TEST_DATABASE_URL=postgres://rms:rms@localhost:55433/rms_test?sslmode=disable \
 *     pnpm --filter @damp/rms test
 */
const TEST_DATABASE_URL =
  process.env.RMS_TEST_DATABASE_URL ?? 'postgres://rms:rms@localhost:55433/rms_test?sslmode=disable';

describe('rms audit producer (real Postgres)', () => {
  let db: DbService;
  let targets: ReserveTargetsRepository;
  let custodians: CustodiansRepository;
  let status: ReserveStatus;

  const ledger = {
    reserveStatus: async () => status,
  } as unknown as CoreLedgerClient;

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    targets = new ReserveTargetsRepository(db);
    custodians = new CustodiansRepository(db);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  beforeEach(() => {
    status = {
      currency: 'USD',
      issued: '100.000000',
      backing: '100.00',
      in_transit: '0',
      ledger_cash: '100.00',
      custodian: { balance: '100.00', as_of: new Date().toISOString(), age_seconds: 1 },
      chains: {},
      open_breaks: [],
      last_run: { id: 'run_1' },
    } as unknown as ReserveStatus;
  });

  async function auditFor(subjectId: string) {
    const { rows } = await db.query<{ action: string; payload: Record<string, unknown> }>(
      `SELECT action, payload FROM audit_outbox WHERE payload->>'subject_id' = $1 ORDER BY id`,
      [subjectId],
    );
    return rows;
  }

  it('audits a reserve target change with what it replaced', async () => {
    const currency = `T${randomUUID().slice(0, 6)}`;
    const controller = new ReservesController(ledger, targets, db);
    await controller.upsert('treasury-1', { requestId: 'gw-r1' }, currency, { minRatioBps: 10000 });
    await controller.upsert('treasury-2', {}, currency, { minRatioBps: 10200, bufferAmount: '50.00' });

    const events = await auditFor(currency);
    expect(events.map((e) => e.payload.actor)).toEqual(['treasury-1', 'treasury-2']);
    expect(events[0].payload).not.toHaveProperty('before_state');
    expect(events[1].payload).toMatchObject({
      action: AUDIT.reserveTargetSet,
      before_state: { minRatioBps: 10000 },
      after_state: { minRatioBps: 10200, bufferAmount: '50.00' },
    });
  });

  it('refuses a body that names a different currency than the path', async () => {
    const controller = new ReservesController(ledger, targets, db);
    await expect(controller.upsert('t', {}, 'USD', { currency: 'KES', minRatioBps: 1 })).rejects.toThrow('path names');
  });

  it('rolls a reserve target back with its audit event', async () => {
    const currency = `R${randomUUID().slice(0, 6)}`;
    // An actor audit-trail would refuse makes the enqueue throw inside the
    // transaction — the upsert before it must not survive.
    const controller = new ReservesController(ledger, targets, db);
    await expect(controller.upsert('', {}, currency, { minRatioBps: 10000 })).rejects.toThrow();
    expect(await targets.find(currency)).toBeNull();
    expect(await auditFor(currency)).toEqual([]);
  });

  it('audits arming a custodian drift, before and after', async () => {
    const id = `cust_${randomUUID()}`;
    await custodians.upsert({ id, name: 'Test', currency: 'USD', provider: 'stub', accountRef: 'x', config: {} });
    const service = { pollOne: async () => null } as unknown as CustodiansService;
    const controller = new CustodiansController(custodians, service, db);

    await controller.setDrift('treasury-1', {}, id, { drift: '-1000.00' });
    await controller.setDrift('treasury-1', {}, id, { drift: '0' });

    const events = await auditFor(id);
    expect(events.map((e) => [e.payload.before_state, e.payload.after_state])).toEqual([
      [{ drift: '0' }, { drift: '-1000.00' }],
      [{ drift: '-1000.00' }, { drift: '0' }],
    ]);
  });

  it('audits an attestation, its refusal while a break is open, and its publication', async () => {
    const controller = new AttestationsController(db, ledger);
    const draft = await controller.create('treasury-1', {}, { preparedBy: 'someone-else' });
    await controller.publish('cfo-1', {}, draft.id);

    const events = await auditFor(draft.id);
    expect(events.map((e) => [e.action, e.payload.actor])).toEqual([
      [AUDIT.attestationCreated, 'treasury-1'],
      [AUDIT.attestationPublished, 'cfo-1'],
    ]);
    expect(events[0].payload).toMatchObject({ metadata: { preparedBy: 'someone-else' } });

    status.open_breaks = [{ leg: 'LEG_C', code: 'CUSTODIAN_SHORTFALL' }] as never;
    const before = await db.query(`SELECT count(*)::int AS n FROM attestations`);
    await expect(controller.create('treasury-9', {}, {})).rejects.toThrow('open reconciliation break');
    expect((await db.query(`SELECT count(*)::int AS n FROM attestations`)).rows[0].n).toBe(before.rows[0].n);
    const { rows } = await db.query<{ payload: Record<string, unknown> }>(
      `SELECT payload FROM audit_outbox WHERE action = $1 AND payload->>'actor' = 'treasury-9'`,
      [AUDIT.attestationRefused],
    );
    expect(rows[0].payload).toMatchObject({ outcome: 'DENIED', metadata: { openBreaks: ['LEG_C/CUSTODIAN_SHORTFALL'] } });
  });
});
