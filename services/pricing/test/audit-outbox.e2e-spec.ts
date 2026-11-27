import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { AUDIT } from '../src/audit/audit-actions';
import { DbService } from '../src/db/db.service';
import { DbExposureGuard } from '../src/exposure/db-exposure.guard';
import { PairsController } from '../src/pairs/pairs.controller';
import { PairsRepository } from '../src/pairs/pairs.repository';

/**
 * Real Postgres, in pricing_test (infra/postgres/init/07-pricing-database.sql).
 * Under test: every pair-policy change commits or rolls back with its audit
 * event, the migration seeds the 42 ordered pairs with the documented
 * policy, and the exposure guard's caps are database properties.
 *
 *   PRICING_TEST_DATABASE_URL=postgres://pricing:pricing@localhost:55433/pricing_test?sslmode=disable \
 *     pnpm --filter @damp/pricing test
 */
const TEST_DATABASE_URL =
  process.env.PRICING_TEST_DATABASE_URL ?? 'postgres://pricing:pricing@localhost:55433/pricing_test?sslmode=disable';

describe('pricing audit producer and exposure guard (real Postgres)', () => {
  let db: DbService;
  let pairs: PairsRepository;

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    pairs = new PairsRepository(db);
    // A prior run that failed mid-test can leave BTC/USD off its seeded
    // policy (the migrations seed only on a fresh database); restore it so
    // the seed assertions below are deterministic. Done in SQL rather than
    // through the controller so the reset writes no audit row.
    await db.query(
      `UPDATE pricing_pairs SET spread_bps = 100, ttl_seconds = 30 WHERE base_ccy = 'BTC' AND quote_ccy = 'USD'`,
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

  async function insertIssued(partyId: string, notionalUsd: string, expiresAt: string) {
    await db.query(
      `INSERT INTO quotes_issued
         (party_id, base, quote, from_amount, rate, spread_bps, notional_usd, sources, expires_at, status, quote_id)
       VALUES ($1, 'USD', 'KES', '100.00', '129.50', 50, $2::numeric, '["fiat"]'::jsonb, $3, 'ISSUED', $4)`,
      [partyId, notionalUsd, expiresAt, randomUUID()],
    );
  }

  it('seeds every ordered pair with the documented policy', async () => {
    const all = await pairs.list();
    // 7 quotable currencies, 7*6 ordered pairs — and never USD-X, never an
    // identity pair.
    expect(all).toHaveLength(42);
    expect(all.some((p) => p.baseCcy === 'USDX' || p.quoteCcy === 'USDX')).toBe(false);
    expect(all.some((p) => p.baseCcy === p.quoteCcy)).toBe(false);

    const btcUsd = await pairs.find('BTC', 'USD');
    expect(btcUsd).toMatchObject({ spreadBps: 100, ttlSeconds: 30, enabled: true, maxNotionalUsd: '10000' });

    const usdKes = await pairs.find('USD', 'KES');
    expect(usdKes).toMatchObject({ spreadBps: 50, ttlSeconds: 300, maxNotionalUsd: '10000' });
  });

  it('audits a pair change with what it replaced', async () => {
    const controller = new PairsController(pairs, db);
    const run = randomUUID();

    await controller.update(`treasury-1-${run}`, {}, 'BTC', 'USD', { spread_bps: 77 });
    await controller.update(`treasury-2-${run}`, {}, 'BTC', 'USD', { spread_bps: 88, ttl_seconds: 45 });

    // Filtered to this run's actor so an earlier run's rows can't drift the
    // assertion; the seeded original spread (100) is asserted relative to
    // the first patch, not absolutely.
    const events = (await auditFor('BTC/USD')).filter((e) =>
      [`treasury-1-${run}`, `treasury-2-${run}`].includes(String(e.payload.actor)),
    );
    expect(events.map((e) => e.action)).toEqual([AUDIT.pairUpdated, AUDIT.pairUpdated]);
    expect(events[0].payload).toMatchObject({
      after_state: { spreadBps: 77 },
      before_state: { spreadBps: 100 },
    });
    expect(events[1].payload).toMatchObject({
      before_state: { spreadBps: 77, ttlSeconds: 30 },
      after_state: { spreadBps: 88, ttlSeconds: 45 },
    });

    // Put the seeded policy back for everything after this test.
    await controller.update(`treasury-9-${run}`, {}, 'BTC', 'USD', { spread_bps: 100, ttl_seconds: 30 });
  });

  it('rolls a pair change back with its audit event', async () => {
    const controller = new PairsController(pairs, db);
    const before = await pairs.find('BTC', 'USD');

    // An actor audit-trail would refuse makes the enqueue throw inside the
    // transaction — the UPDATE before it must not survive.
    await expect(controller.update('', {}, 'BTC', 'USD', { spread_bps: 99 })).rejects.toThrow();
    const after = await pairs.find('BTC', 'USD');
    expect(after).toEqual(before);
  });

  it('refuses an unquotable currency without writing anything', async () => {
    const controller = new PairsController(pairs, db);
    await expect(controller.update('t', {}, 'DOGE', 'USD', { spread_bps: 1 })).rejects.toThrow('not a quotable');
  });

  it('enforces the per-quote notional cap', async () => {
    const guard = new DbExposureGuard(db, {
      get: () => '25000',
    } as unknown as ConfigService);
    const pair = (await pairs.find('BTC', 'USD'))!;
    const quote = { base: 'BTC', quote: 'USD', fromAmount: '0.1', rate: '100000', spreadBps: 100, sources: ['stub'] };

    await expect(guard.reserve(pair, '10000', `cap_${randomUUID()}`, quote)).resolves.toBeDefined();
    await expect(guard.reserve(pair, '10000.01', `cap_${randomUUID()}`, quote)).rejects.toMatchObject({ response: { code: 'NOTIONAL_OVER_MAX' } });
  });

  it('counts only unexpired quotes toward the outstanding cap', async () => {
    const expiredParty = `expired_${randomUUID()}`;
    const liveParty = `live_${randomUUID()}`;
    const guard = new DbExposureGuard(db, {
      get: () => '250',
    } as unknown as ConfigService);
    const pair = (await pairs.find('USD', 'KES'))!;
    const quote = { base: 'USD', quote: 'KES', fromAmount: '200.00', rate: '129.50', spreadBps: 50, sources: ['fiat'] };

    // One ISSUED quote already past its expiry, one still consumable.
    await insertIssued(expiredParty, '300', new Date(Date.now() - 3600_000).toISOString());
    await insertIssued(liveParty, '300', new Date(Date.now() + 3600_000).toISOString());

    // The expired quote does not count: 200 more still fits under 250.
    await expect(guard.reserve(pair, '200', expiredParty, quote)).resolves.toBeDefined();
    // The unexpired quote already holds 300 > 250 on its own.
    await expect(guard.reserve(pair, '200', liveParty, quote)).rejects.toMatchObject({ response: { code: 'PARTY_OUTSTANDING_CAP_EXCEEDED' } });
  });
});
