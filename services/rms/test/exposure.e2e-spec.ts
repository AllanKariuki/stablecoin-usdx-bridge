import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AUDIT } from '../src/audit/audit-actions';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';
import { DbService } from '../src/db/db.service';
import { ExposureController } from '../src/exposure/exposure.controller';
import { ExposureLimitsRepository } from '../src/exposure/exposure-limits.repository';
import { ExposureService } from '../src/exposure/exposure.service';
import { CustodiansRepository } from '../src/custodians/custodians.repository';
import { TreasuryRebalancesRepository } from '../src/exposure/treasury-rebalances.repository';

/**
 * The exposure write routes against real Postgres (rms_test, like the
 * audit-outbox spec): a limit change and a posted rebalance must commit or
 * roll back with their audit events, and a retried trade must not be
 * audited twice.
 *
 *   RMS_TEST_DATABASE_URL=postgres://rms:rms@localhost:55433/rms_test?sslmode=disable \
 *     pnpm --filter @damp/rms test
 */
const TEST_DATABASE_URL =
  process.env.RMS_TEST_DATABASE_URL ?? 'postgres://rms:rms@localhost:55433/rms_test?sslmode=disable';

describe('rms exposure audit producer (real Postgres)', () => {
  let db: DbService;
  let controller: ExposureController;
  let limits: ExposureLimitsRepository;

  const ledger = {
    postTreasuryRebalance: jest.fn(async () => ({ id: `tx_${randomUUID()}` })),
  } as unknown as CoreLedgerClient;

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    limits = new ExposureLimitsRepository(db);
    const service = new ExposureService(
      ledger,
      limits,
      new CustodiansRepository(db),
      { get: () => '0' } as unknown as ConfigService,
    );
    controller = new ExposureController(
      service,
      ledger,
      limits,
      new TreasuryRebalancesRepository(db),
      db,
    );
  });

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

  it('audits an exposure limit change with what it replaced', async () => {
    const currency = `L${randomUUID().slice(0, 6).toUpperCase()}`;
    // The seeds put every custodial crypto currency in the check constraint
    // table already, so this uses a fresh synthetic currency row instead:
    // exposure_limits has no currency check, only the route validates.
    await controller.putLimit('treasury-1', {}, currency, { max_short: '5', max_long: '5' });
    await controller.putLimit('treasury-2', {}, currency, { max_short: '4.5', max_long: '6' });

    const events = await auditFor(currency);
    expect(events.map((e) => e.payload.actor)).toEqual(['treasury-1', 'treasury-2']);
    expect(events[0].payload).not.toHaveProperty('before_state');
    expect(events[1].payload).toMatchObject({
      action: AUDIT.exposureLimitSet,
      before_state: { maxShort: '5', maxLong: '5' },
      after_state: { maxShort: '4.5', maxLong: '6' },
    });
  });

  it('refuses a limit body that is not a non-negative decimal', async () => {
    await expect(
      controller.putLimit('t', {}, 'BTC', { max_short: '-1', max_long: '5' }),
    ).rejects.toThrow('non-negative');
    await expect(
      controller.putLimit('t', {}, 'BTC', { max_short: '1.000000001', max_long: '5' }),
    ).rejects.toThrow('non-negative');
  });

  it('records a posted rebalance with its audit event, and replays without double-auditing', async () => {
    const body = {
      side: 'BUY',
      currency: 'BTC',
      amount: '0.00260000',
      fiat_currency: 'KES',
      fiat_amount: '130000.00',
      custodian_ref: `TRADE-${randomUUID()}`,
      note: 'e2e',
    };

    const first = await controller.rebalance('treasury-1', {}, body);
    if (!('id' in first)) throw new Error('expected a recorded rebalance row');
    const events = await auditFor(first.id);
    expect(events).toHaveLength(1);
    expect(events[0].payload).toMatchObject({
      action: AUDIT.treasuryRebalancePosted,
      actor: 'treasury-1',
      after_state: { side: 'BUY', currency: 'BTC', amount: '0.00260000' },
      metadata: { ledgerTxId: expect.any(String) },
    });

    // Replay of the same ledger transaction (the deterministic
    // Idempotency-Key makes core-ledger return the same journal tx) must
    // not create a second row or a second audit event.
    (ledger.postTreasuryRebalance as jest.Mock).mockResolvedValue({ id: first.ledger_tx_id });
    const second = await controller.rebalance('treasury-1', {}, body);
    expect(second).toMatchObject({ replay: true });
    expect(await auditFor(first.id)).toHaveLength(1);
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM treasury_rebalances WHERE id = $1`,
      [first.id],
    );
    expect(rows[0].n).toBe(1);
  });

  it('rolls a rebalance record back when the audit enqueue refuses', async () => {
    // Fresh ledger mock: the previous test pinned it to one transaction id
    // for the replay, and a stray shared id would make this look like a
    // replay instead of a rollback.
    (ledger.postTreasuryRebalance as jest.Mock).mockImplementation(async () => ({ id: `tx_${randomUUID()}` }));

    const before = await db.query(`SELECT count(*)::int AS n FROM treasury_rebalances`);
    const body = {
      side: 'SELL',
      currency: 'ETH',
      amount: '0.01',
      fiat_currency: 'USD',
      fiat_amount: '35.00',
      custodian_ref: `TRADE-${randomUUID()}`,
      note: 'rollback',
    };
    // An actor audit-trail would refuse makes the enqueue throw inside the
    // transaction — the record before it must not survive.
    await expect(controller.rebalance('', {}, body)).rejects.toThrow();
    const after = await db.query(`SELECT count(*)::int AS n FROM treasury_rebalances`);
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });
});
