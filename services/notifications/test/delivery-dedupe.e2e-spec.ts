import { Pool } from 'pg';
import { DbService } from '../src/db/db.service';
import { DeliveryService } from '../src/delivery/delivery.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';

/**
 * Replays against a real Postgres, because the dedupe is two UNIQUE
 * constraints and an ON CONFLICT each — nothing a mock would exercise.
 *
 * payments' outbox relay (and core-ledger's) are at-least-once: a relay that
 * dies after notifications accepted an event, but before marking it
 * published, sends it again. The customer must still be told once, on every
 * channel, including the webhook queue.
 *
 * notifications_test, never the dev database — created alongside it by
 * infra/postgres/init/03-p4-databases.sql.
 */
const TEST_DATABASE_URL =
  process.env.NOTIFICATIONS_TEST_DATABASE_URL ??
  'postgres://notifications:notifications@localhost:55433/notifications_test?sslmode=disable';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

describe('delivery dedupe (real Postgres)', () => {
  let raw: Pool;
  let db: DbService;
  let webhooks: WebhooksService;
  const live = { push: jest.fn(() => 1) };
  const email = { send: jest.fn(async () => 1) };
  let delivery: DeliveryService;

  beforeAll(async () => {
    raw = new Pool({ connectionString: TEST_DATABASE_URL });
    await raw.query(
      `DROP TABLE IF EXISTS webhook_deliveries, webhook_endpoints, deliveries, preferences, templates,
                            schema_migrations CASCADE`,
    );
    db = new DbService(config({ DATABASE_URL: TEST_DATABASE_URL }));
    await db.onModuleInit();
    // onModuleInit is not called: no drain timer, nothing is POSTed anywhere.
    webhooks = new WebhooksService(db, config({}));
    delivery = new DeliveryService(db, live as never, email as never, webhooks);
  });

  afterAll(async () => {
    await db.onModuleDestroy();
    await raw.end();
  });

  beforeEach(async () => {
    await raw.query('TRUNCATE webhook_deliveries, webhook_endpoints, deliveries');
    live.push.mockClear();
    email.send.mockClear();
  });

  const settled = (dedupeKey?: string) => ({
    event: 'payment.settled',
    partyId: 'party_1',
    payload: { intentId: 'pi_1', direction: 'DEPOSIT', amount: '250.00', currency: 'USD', ledgerTxId: 'tx_1' },
    dedupeKey,
  });

  const count = async (table: string) => Number((await raw.query(`SELECT count(*) FROM ${table}`)).rows[0].count);

  it('tells the customer once when the same event id arrives twice', async () => {
    await webhooks.register('party_1', 'https://example.test/hook', []);

    await delivery.notify(settled('evt_1'));
    await delivery.notify(settled('evt_1'));

    expect(live.push).toHaveBeenCalledTimes(1);
    expect(email.send).toHaveBeenCalledTimes(1);
    // One per channel: the in-app message and the email must not collide
    // with each other while still colliding with their own replay.
    expect(await count('deliveries')).toBe(2);
    // The hole this phase closed: the webhook queue used to grow per replay.
    expect(await count('webhook_deliveries')).toBe(1);
  });

  it('still queues one webhook delivery per subscribed endpoint', async () => {
    await webhooks.register('party_1', 'https://example.test/a', []);
    await webhooks.register('party_1', 'https://example.test/b', ['payment.settled']);

    await delivery.notify(settled('evt_2'));
    await delivery.notify(settled('evt_2'));

    expect(await count('webhook_deliveries')).toBe(2);
  });

  it('treats distinct event ids as distinct notifications', async () => {
    await webhooks.register('party_1', 'https://example.test/hook', []);

    await delivery.notify(settled('evt_3'));
    await delivery.notify(settled('evt_4'));

    expect(email.send).toHaveBeenCalledTimes(2);
    expect(await count('webhook_deliveries')).toBe(2);
  });

  it('does not dedupe callers that send no key', async () => {
    // The pre-outbox best-effort callers. NULL never conflicts, so their
    // behaviour is unchanged.
    await webhooks.register('party_1', 'https://example.test/hook', []);

    await delivery.notify(settled());
    await delivery.notify(settled());

    expect(await count('webhook_deliveries')).toBe(2);
  });

  it('records a fanned-out push as sent with no local recipient count', async () => {
    live.push.mockReturnValueOnce(null as never);

    const result = await delivery.notify(settled('evt_5'));

    expect(result.delivered).toBe(2);
    const { rows } = await raw.query(
      `SELECT status, payload->'recipients' AS recipients FROM deliveries WHERE channel = 'IN_APP'`,
    );
    expect(rows).toEqual([{ status: 'SENT', recipients: null }]);
  });
});
