import { randomUUID } from 'node:crypto';
import { connect, headers, JetStreamManager, NatsConnection, RetentionPolicy, StorageType, nanos } from 'nats';
import { Pool } from 'pg';
import { DbService } from '../src/db/db.service';
import { DeliveryService } from '../src/delivery/delivery.service';
import { OutboxConsumer } from '../src/ingest/outbox-consumer';
import { OutboxHandler } from '../src/ingest/outbox-handler';
import { NatsService } from '../src/nats/nats.service';
import { WebhooksService } from '../src/webhooks/webhooks.service';

/**
 * core-ledger's outbox, consumed from a real JetStream into a real Postgres.
 *
 * Neither half is mockable in a way that would mean anything: the guarantees
 * under test are JetStream's (a durable shared by two consumers hands each
 * message to one; an unacked message comes back) and Postgres's (a UNIQUE
 * key and a conditional UPDATE decide who sends). The broker and database are
 * docker-compose's (`make up`) or CI's service containers.
 *
 * Messages are published exactly the way core-ledger/internal/outbox/nats.go
 * publishes them — subject = event type, the payload bytes as-is, X-Event-Type
 * / X-Aggregate-Type / X-Aggregate-Id headers and Nats-Msg-Id
 * `<event_type>:<outbox row id>` — into a stream configured exactly as
 * NewNATSPublisher configures DAMP.
 */
const NATS_URL = process.env.NOTIFICATIONS_TEST_NATS_URL ?? 'nats://localhost:54222';
const TEST_DATABASE_URL =
  process.env.NOTIFICATIONS_TEST_DATABASE_URL ??
  'postgres://notifications:notifications@localhost:55433/notifications_test?sslmode=disable';

const STREAM = 'DAMP';
const TX_POSTED = 'damp.ledger.transaction_posted.v1';
const BREAK_OPENED = 'damp.reserves.reconciliation_break_opened.v1';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

/** Outbox row ids no other run (or dev data already in DAMP) will have used. */
let nextId = Date.now() * 1000;
const outboxId = () => String(++nextId);

async function until(cond: () => Promise<boolean> | boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!(await cond())) {
    if (Date.now() > deadline) throw new Error('timed out waiting for condition');
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

/** core-ledger's NewNATSPublisher stream config, field for field. */
async function ensureDampStream(jsm: JetStreamManager): Promise<void> {
  await jsm.streams.add({
    name: STREAM,
    subjects: ['damp.>'],
    storage: StorageType.File,
    retention: RetentionPolicy.Limits,
    max_age: nanos(30 * 24 * 60 * 60 * 1000),
    duplicate_window: nanos(2 * 60 * 60 * 1000),
  });
}

describe('core-ledger outbox over JetStream (real NATS, real Postgres)', () => {
  let raw: Pool;
  let db: DbService;
  let webhooks: WebhooksService;
  let delivery: DeliveryService;
  let handler: OutboxHandler;
  let publisher: NatsConnection;
  let jsm: JetStreamManager;
  /** Whether this suite created DAMP, and so may remove it afterwards. */
  let ownsStream = false;
  const live = { push: jest.fn((..._args: unknown[]) => 1 as number | null) };
  const email = { send: jest.fn(async (..._args: unknown[]) => 1) };

  const durables: string[] = [];
  const running: Array<{ consumer: OutboxConsumer; nats: NatsService }> = [];

  async function replica(overrides: Record<string, unknown> = {}, durable?: string) {
    const name = durable ?? `notifications-outbox-test-${randomUUID().slice(0, 8)}`;
    if (!durables.includes(name)) durables.push(name);
    const values = {
      NATS_URL,
      NATS_STREAM: STREAM,
      OUTBOX_CONSUMER_DURABLE: name,
      OUTBOX_CONSUMER_ACK_WAIT_MS: 2_000,
      OUTBOX_CONSUMER_BACKOFF_BASE_MS: 50,
      OUTBOX_CONSUMER_BACKOFF_MAX_MS: 200,
      OUTBOX_CONSUMER_RETRY_MS: 200,
      // Every test makes its own durable; `all` would hand each one every
      // earlier test's messages too. The backlog test opts back in.
      OUTBOX_CONSUMER_DELIVER_POLICY: 'new',
      ...overrides,
    };
    const nats = new NatsService(config(values));
    nats.onModuleInit();
    // Each replica its own handler instance, so tests can tell them apart.
    const own = new OutboxHandler(delivery);
    const consumer = new OutboxConsumer(nats, own, config(values));
    consumer.onApplicationBootstrap();
    running.push({ consumer, nats });
    return { consumer, nats, handler: own, durable: name };
  }

  async function publish(eventType: string, id: string, payload: Record<string, unknown>, aggregateId = 'agg_1') {
    // outbox/nats.go's Publish, transliterated.
    const h = headers();
    h.set('X-Event-Type', eventType);
    h.set('X-Aggregate-Type', eventType.startsWith('damp.ledger.') ? 'TRANSACTION' : 'RECONCILIATION');
    h.set('X-Aggregate-Id', aggregateId);
    await publisher.jetstream().publish(eventType, new TextEncoder().encode(JSON.stringify(payload)), {
      msgID: `${eventType}:${id}`,
      headers: h,
    });
  }

  /** ledger.transactionPostedPayload's shape, trimmed to what matters here. */
  const txPosted = (party: string, description = 'Deposit') => ({
    transaction_id: `tx_${randomUUID()}`,
    type: 'DEPOSIT',
    status: 'POSTED',
    idempotency_key: randomUUID(),
    entity_type: 'PAYMENT',
    entity_id: 'pi_1',
    external_ref: '',
    reverses_tx_id: null,
    manual_entry: false,
    value_date: '2026-11-12',
    description,
    initiated_by: party,
    posted_at: new Date().toISOString(),
    entries: [
      { line_no: 1, account_id: 'acc_1', gl_code: '1000', direction: 'DEBIT', currency: 'USD', decimals: 2, amount: '250.00', running_balance: '250.00' },
      { line_no: 2, account_id: 'acc_2', gl_code: '2000', direction: 'CREDIT', currency: 'USD', decimals: 2, amount: '250.00', running_balance: '250.00' },
    ],
  });

  const rowsFor = async (id: string) =>
    (
      await raw.query<{ channel: string; status: string; attempts: number }>(
        `SELECT channel, status, attempts FROM deliveries WHERE dedupe_key LIKE $1 ORDER BY channel`,
        [`outbox:${id}:%`],
      )
    ).rows;

  const pushesFor = (description: string) =>
    live.push.mock.calls.filter((c) => (c[2] as { body?: string })?.body?.includes(description)).length;

  beforeAll(async () => {
    raw = new Pool({ connectionString: TEST_DATABASE_URL });
    await raw.query(
      `DROP TABLE IF EXISTS webhook_deliveries, webhook_endpoints, deliveries, preferences, templates,
                            schema_migrations CASCADE`,
    );
    db = new DbService(config({ DATABASE_URL: TEST_DATABASE_URL }));
    await db.onModuleInit();
    webhooks = new WebhooksService(db, config({}));
    delivery = new DeliveryService(db, live as never, email as never, webhooks, config({ PENDING_STALE_SECONDS: 60 }));
    handler = new OutboxHandler(delivery);

    publisher = await connect({ servers: NATS_URL, name: 'notifications-test-publisher' });
    jsm = await publisher.jetstreamManager();
    ownsStream = !(await jsm.streams.info(STREAM).then(() => true).catch(() => false));
  });

  afterAll(async () => {
    for (const r of running) {
      await r.consumer.onModuleDestroy();
      await r.nats.close();
    }
    for (const d of durables) await jsm.consumers.delete(STREAM, d).catch(() => undefined);
    // Leave the broker as it was found. A DAMP that was already there is
    // core-ledger's (or a developer's) and is not this suite's to remove.
    if (ownsStream) await jsm.streams.delete(STREAM).catch(() => undefined);
    await publisher.drain();
    await db.onModuleDestroy();
    await raw.end();
  });

  beforeEach(async () => {
    await raw.query('TRUNCATE webhook_deliveries, webhook_endpoints, deliveries');
    live.push.mockClear();
    email.send.mockClear();
    // Every test but the first needs the stream; the first is about it not
    // being there yet, and creates it itself.
    if (!expect.getState().currentTestName?.includes('waits for core-ledger')) await ensureDampStream(jsm);
  });

  it('waits for core-ledger to create the stream rather than failing', async () => {
    if (!ownsStream) {
      // DAMP already exists on this broker, so "before the stream" cannot be
      // staged without deleting someone else's data. Covered by every fresh
      // CI run, where the broker starts empty.
      await ensureDampStream(jsm);
      return;
    }
    const r = await replica();
    let ready = false;
    void r.consumer.whenReady().then(() => (ready = true));

    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(ready).toBe(false);

    // What core-ledger's relay does on its first connect.
    await ensureDampStream(jsm);
    await until(() => ready);

    const id = outboxId();
    await publish(TX_POSTED, id, txPosted('party_late', 'late-stream'));
    await until(async () => (await rowsFor(id)).length === 1);
    expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'SENT', attempts: 1 }]);
  });

  it('delivers an event published in core-ledger\'s exact format once, to its party', async () => {
    const r = await replica();
    await r.consumer.whenReady();
    const id = outboxId();

    await publish(TX_POSTED, id, txPosted('party_1', 'exact-format'), 'tx_agg');

    await until(async () => (await rowsFor(id)).some((row) => row.status === 'SENT'));
    expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'SENT', attempts: 1 }]);
    expect(pushesFor('exact-format')).toBe(1);
    // initiated_by is the party, exactly as on the HTTP door.
    expect(live.push.mock.calls.find((c) => (c[2] as { body: string }).body.includes('exact-format'))?.[0]).toBe(
      'party_1',
    );
    expect((await r.consumer.metrics.get()).values.find((v) => v.labels.outcome === 'handled')?.value).toBe(1);
  });

  it('picks up the backlog published while nothing consumed the stream (deliver policy all)', async () => {
    // The bug this consumer fixes: events relayed to JetStream before it
    // existed. A new durable must start from them, not after them.
    const id = outboxId();
    await publish(TX_POSTED, id, txPosted('party_7', `backlog-${id}`));

    const r = await replica({ OUTBOX_CONSUMER_DELIVER_POLICY: 'all' });
    await r.consumer.whenReady();

    await until(async () => (await rowsFor(id))[0]?.status === 'SENT', 20_000);
    expect(pushesFor(`backlog-${id}`)).toBe(1);
  });

  it('delivers a reconciliation break to operators on every templated channel', async () => {
    const r = await replica();
    await r.consumer.whenReady();
    const id = outboxId();

    // reconciliation.breakPayload's shape.
    await publish(BREAK_OPENED, id, {
      break_id: 'brk_1',
      leg: 'LEG_B',
      code: 'SUPPLY_MISMATCH',
      detail: 'chain supply exceeds reserve',
      drift: '1000000',
      opened_at: '2026-11-12T10:00:00Z',
      observations: 1,
      severity: 'critical',
    });

    await until(async () => (await rowsFor(id)).filter((row) => row.status === 'SENT').length === 2);
    expect((await rowsFor(id)).map((row) => row.channel)).toEqual(['EMAIL', 'IN_APP']);
    const toast = live.push.mock.calls.find((c) => (c[2] as { subject: string }).subject.includes('LEG_B'));
    expect(toast?.[0]).toBe(''); // operator broadcast
    expect(email.send).toHaveBeenCalledTimes(1);
  });

  it('dedupes a redelivery: the consumer died after handling but before acking', async () => {
    const r = await replica();
    await r.consumer.whenReady();
    const real = r.handler.handle.bind(r.handler);
    const spy = jest
      .spyOn(r.handler, 'handle')
      // First delivery: the work is done, then the process "dies" before the
      // ack. JetStream must hand the message out again.
      .mockImplementationOnce(async (...args) => {
        await real(...args);
        throw new Error('simulated crash after handling');
      });
    const id = outboxId();

    await publish(TX_POSTED, id, txPosted('party_2', 'redelivered'));

    await until(() => spy.mock.calls.length >= 2);
    await until(async () => (await r.consumer.metrics.get()).values.some((v) => v.labels.outcome === 'handled'));
    expect(spy).toHaveBeenCalledTimes(2);
    expect(pushesFor('redelivered')).toBe(1);
    expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'SENT', attempts: 1 }]);
  });

  it('dedupes across transports: an event already delivered over HTTP is not delivered again from JetStream', async () => {
    const id = outboxId();
    // What /internal/outbox does with X-Event-Id: <id>.
    await handler.handle(TX_POSTED, id, txPosted('party_3', 'switched-transport'));

    const r = await replica();
    await r.consumer.whenReady();
    await publish(TX_POSTED, id, txPosted('party_3', 'switched-transport'));

    await until(async () => (await r.consumer.metrics.get()).values.some((v) => v.labels.outcome === 'handled'));
    expect(pushesFor('switched-transport')).toBe(1);
    expect(await rowsFor(id)).toHaveLength(1);
  });

  it('shares one durable between two replicas without processing anything twice', async () => {
    const durable = `notifications-outbox-shared-${randomUUID().slice(0, 8)}`;
    const a = await replica({}, durable);
    const b = await replica({}, durable);
    await Promise.all([a.consumer.whenReady(), b.consumer.whenReady()]);
    // Slow enough that neither replica can drain the batch alone.
    for (const r of [a, b]) {
      const real = r.handler.handle.bind(r.handler);
      jest.spyOn(r.handler, 'handle').mockImplementation(async (...args) => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return real(...args);
      });
    }

    const ids = Array.from({ length: 40 }, outboxId);
    for (const id of ids) await publish(TX_POSTED, id, txPosted('party_4', `shared-${id}`));

    const handledBy = async (r: typeof a) =>
      (await r.consumer.metrics.get()).values.find((v) => v.labels.outcome === 'handled')?.value ?? 0;
    await until(async () => (await handledBy(a)) + (await handledBy(b)) === 40, 20_000);

    const callsA = (a.handler.handle as jest.Mock).mock.calls.length;
    const callsB = (b.handler.handle as jest.Mock).mock.calls.length;
    // Each event handled exactly once, by one replica or the other.
    expect(callsA + callsB).toBe(40);
    expect(callsA).toBeGreaterThan(0);
    expect(callsB).toBeGreaterThan(0);
    const sent = await raw.query(`SELECT count(*) FROM deliveries WHERE status = 'SENT' AND body LIKE '%shared-%'`);
    expect(Number(sent.rows[0].count)).toBe(40);
    for (const id of ids) expect(pushesFor(`shared-${id}`)).toBe(1);
  });

  it('terminates a payload that is not JSON at once, and counts it', async () => {
    const r = await replica();
    await r.consumer.whenReady();
    const id = outboxId();
    const h = headers();
    h.set('X-Event-Type', TX_POSTED);
    await publisher.jetstream().publish(TX_POSTED, new TextEncoder().encode('not json{'), {
      msgID: `${TX_POSTED}:${id}`,
      headers: h,
    });

    const terminated = async () =>
      (await r.consumer.metrics.get()).values.find((v) => v.labels.outcome === 'terminated')?.value ?? 0;
    await until(async () => (await terminated()) === 1);
    // And it does not come back.
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(await terminated()).toBe(1);
    expect(await rowsFor(id)).toHaveLength(0);
  });

  it('naks a failing event with backoff, then terminates it after the delivery budget', async () => {
    const r = await replica({ OUTBOX_CONSUMER_MAX_DELIVERIES: 3 });
    await r.consumer.whenReady();
    const spy = jest.spyOn(r.handler, 'handle').mockRejectedValue(new Error('database unreachable'));
    const id = outboxId();

    await publish(TX_POSTED, id, txPosted('party_5', 'poison'));

    const outcome = async (name: string) =>
      (await r.consumer.metrics.get()).values.find((v) => v.labels.outcome === name)?.value ?? 0;
    await until(async () => (await outcome('terminated')) === 1);
    expect(spy).toHaveBeenCalledTimes(3);
    expect(await outcome('retried')).toBe(2);
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    expect(spy).toHaveBeenCalledTimes(3);
  });

  describe('a delivery left PENDING by a crash', () => {
    /** The row a process writes in step 1 and then dies holding. */
    const strand = (id: string, leaseAgeSeconds: number, attempts = 1) =>
      raw.query(
        `INSERT INTO deliveries (id, party_id, event, channel, subject, body, severity, payload, status, dedupe_key, claimed_at, attempts)
         VALUES ($1, 'party_6', $2, 'IN_APP', 'Account activity', $3, 'info', '{}', 'PENDING', $4,
                 now() - make_interval(secs => $5), $6)`,
        [`dlv_${randomUUID()}`, TX_POSTED, `DEPOSIT posted: stranded-${id}`, `outbox:${id}:IN_APP`, leaseAgeSeconds, attempts],
      );

    it('is re-sent when JetStream redelivers its event, not skipped as a duplicate', async () => {
      const r = await replica();
      await r.consumer.whenReady();
      const id = outboxId();
      await strand(id, 600);

      await publish(TX_POSTED, id, txPosted('party_6', `stranded-${id}`));

      await until(async () => (await rowsFor(id))[0]?.status === 'SENT');
      expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'SENT', attempts: 2 }]);
      expect(pushesFor(`stranded-${id}`)).toBe(1);
    });

    it('is left alone while its lease is live — somebody is sending it right now', async () => {
      const id = outboxId();
      await strand(id, 5);

      await handler.handle(TX_POSTED, id, txPosted('party_6', `stranded-${id}`));

      expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'PENDING', attempts: 1 }]);
      expect(pushesFor(`stranded-${id}`)).toBe(0);
    });

    it('is reclaimed by exactly one of two concurrent replays', async () => {
      const id = outboxId();
      await strand(id, 600);

      await Promise.all([
        handler.handle(TX_POSTED, id, txPosted('party_6', `stranded-${id}`)),
        handler.handle(TX_POSTED, id, txPosted('party_6', `stranded-${id}`)),
      ]);

      expect(pushesFor(`stranded-${id}`)).toBe(1);
      expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'SENT', attempts: 2 }]);
    });

    it('is re-sent by the sweeper even if its event never comes back', async () => {
      const id = outboxId();
      await strand(id, 600);

      expect(await delivery.sweep()).toBe(1);
      // A second sweep finds nothing: the row is SENT.
      expect(await delivery.sweep()).toBe(0);

      expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'SENT', attempts: 2 }]);
      expect(pushesFor(`stranded-${id}`)).toBe(1);
    });

    it('is marked FAILED, not retried forever, once its attempts are spent', async () => {
      const id = outboxId();
      await strand(id, 600, 5);

      expect(await delivery.sweep()).toBe(0);
      await handler.handle(TX_POSTED, id, txPosted('party_6', `stranded-${id}`));

      expect(await rowsFor(id)).toEqual([{ channel: 'IN_APP', status: 'FAILED', attempts: 5 }]);
      expect(pushesFor(`stranded-${id}`)).toBe(0);
    });
  });
});

describe('outbox consumer without NATS_URL', () => {
  it('does not start, leaving /internal/outbox as the only door', async () => {
    const nats = new NatsService(config({ NATS_URL: '' }));
    nats.onModuleInit();
    const handler = { handle: jest.fn() };
    const consumer = new OutboxConsumer(nats, handler as never, config({}));

    consumer.onApplicationBootstrap();
    await consumer.onModuleDestroy();

    expect(nats.enabled).toBe(false);
    expect(nats.connection()).toBeNull();
    expect(handler.handle).not.toHaveBeenCalled();
  });
});
