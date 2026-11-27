import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { CoreLedgerClient } from '../src/core-ledger/core-ledger.client';
import { DbService } from '../src/db/db.service';
import { DbExposureGuard } from '../src/exposure/db-exposure.guard';
import { parseRate } from '../src/money/rate';
import { PairsRepository } from '../src/pairs/pairs.repository';
import { QuotesService } from '../src/quotes/quotes.service';
import { Aggregator } from '../src/rates/aggregator';

/**
 * Reserve-first exposure, against the real `pricing_test` database: the
 * outstanding cap and the reservation lifecycle are database properties, so
 * this exercises the real DbExposureGuard and DbService (no overrides) and
 * only fakes the two outbound seams — the aggregator and core-ledger.
 *
 *   PRICING_TEST_DATABASE_URL=postgres://pricing:pricing@localhost:55433/pricing_test?sslmode=disable \
 *     pnpm --filter @damp/pricing test
 */
const TEST_DATABASE_URL =
  process.env.PRICING_TEST_DATABASE_URL ?? 'postgres://pricing:pricing@localhost:55433/pricing_test?sslmode=disable';

const OUTSTANDING_CAP = '250';

describe('pricing reserve-first exposure (real Postgres)', () => {
  let db: DbService;
  let guard: DbExposureGuard;

  beforeAll(async () => {
    db = new DbService({ get: () => TEST_DATABASE_URL } as unknown as ConfigService);
    await db.onModuleInit();
    guard = new DbExposureGuard(db, { get: () => OUTSTANDING_CAP } as unknown as ConfigService);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
  });

  const aggregator = {
    rateFor: jest.fn(() => ({ rate: parseRate('129.50'), sources: ['stub'], at: new Date() })),
  } as unknown as Aggregator;

  function makeService(ledger: CoreLedgerClient): QuotesService {
    return new QuotesService(ledger, aggregator, new PairsRepository(db), guard);
  }

  function happyLedger(): CoreLedgerClient {
    return {
      createQuote: jest.fn(async (input: Record<string, unknown>) => ({
        id: randomUUID(),
        base_currency: input.baseCcy,
        quote_currency: input.quoteCcy,
        rate: input.rate,
        spread_bps: input.spreadBps,
        from_amount: input.fromAmount,
        party_id: input.partyId,
        expires_at: new Date(Date.now() + 300_000).toISOString(),
      })),
    } as unknown as CoreLedgerClient;
  }

  it('serializes concurrent quote requests under the outstanding cap', async () => {
    const partyId = `race_${randomUUID()}`;
    const svc = makeService(happyLedger());

    // Six $100 requests race one party against a $250 outstanding cap. The
    // per-party advisory lock must let exactly two through and refuse the
    // other four — a naive check-then-insert would let all six slip under.
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () => svc.create({ from: 'USD', to: 'KES', amount: '100', partyId })),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');

    expect(fulfilled).toHaveLength(2);
    expect(rejected).toHaveLength(4);
    for (const r of rejected) {
      expect(r.reason).toMatchObject({ response: { code: 'PARTY_OUTSTANDING_CAP_EXCEEDED' } });
    }

    // The party now holds exactly two outstanding ISSUED $100 quotes.
    const { rows } = await db.query<{ total: string }>(
      `SELECT COALESCE(SUM(notional_usd), 0)::text AS total
       FROM quotes_issued
       WHERE party_id = $1 AND status = 'ISSUED' AND expires_at > now()`,
      [partyId],
    );
    expect(rows[0].total).toBe('200.00');
  });

  it('deletes the reservation when the ledger call fails', async () => {
    const partyId = `fail_${randomUUID()}`;
    const svc = makeService({
      createQuote: jest.fn(async () => {
        throw new Error('ledger down');
      }),
    } as unknown as CoreLedgerClient);

    await expect(svc.create({ from: 'USD', to: 'KES', amount: '100', partyId })).rejects.toThrow('ledger down');

    // The failed attempt must not leave a RESERVED row behind to burn the
    // party's outstanding cap.
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM quotes_issued WHERE party_id = $1`,
      [partyId],
    );
    expect(rows[0].n).toBe(0);
  });
});
