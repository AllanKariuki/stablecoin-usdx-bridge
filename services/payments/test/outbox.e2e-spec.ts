import { PlatformMetricsService } from '@damp/nest-platform';
import { AddressInfo } from 'node:net';
import { createServer, IncomingMessage, Server } from 'node:http';
import { Pool } from 'pg';
import { DbService } from '../src/db/db.service';
import { IntentsRepository } from '../src/intents/intents.repository';
import { SettlementService } from '../src/intents/settlement.service';
import { InvoicesController } from '../src/invoices/invoices.controller';
import { InvoicesRepository } from '../src/invoices/invoices.repository';
import { backoffSeconds, OutboxRelay } from '../src/outbox/outbox.relay';
import { OutboxRepository } from '../src/outbox/outbox.repository';

/**
 * The outbox against a real Postgres, because everything it promises lives in
 * SQL: that the event commits or rolls back with the status change, that
 * SKIP LOCKED hands each row to one relay, and that a failed delivery is
 * rescheduled rather than lost.
 *
 * Its own database, never the dev one — the same rule core-ledger learned the
 * hard way (see the 2026-11-09 CHANGELOG): payments_test is created alongside
 * payments by infra/postgres/init/03-p4-databases.sql.
 */
const TEST_DATABASE_URL =
  process.env.PAYMENTS_TEST_DATABASE_URL ??
  'postgres://payments:payments@localhost:55433/payments_test?sslmode=disable';

/** A stand-in for services/notifications' /internal/events that can be told to be down. */
class FakeNotifications {
  status = 200;
  received: { event: string; partyId: string; dedupeKey: string; payload: Record<string, unknown> }[] = [];
  private server!: Server;
  url = '';

  async start(): Promise<void> {
    this.server = createServer((req: IncomingMessage, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        if (this.status < 300) this.received.push(JSON.parse(body));
        res.statusCode = this.status;
        res.end('{}');
      });
    });
    await new Promise<void>((resolve) => this.server.listen(0, '127.0.0.1', resolve));
    this.url = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) => this.server.close(() => resolve()));
  }
}

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

describe('payments outbox (real Postgres)', () => {
  let db: DbService;
  let raw: Pool;
  let notifications: FakeNotifications;
  let intents: IntentsRepository;
  let invoices: InvoicesRepository;
  let outbox: OutboxRepository;

  const ledger = {
    deposit: jest.fn(async () => ({ id: 'tx_1', type: 'FIAT_DEPOSIT', status: 'POSTED', created_at: '' })),
  };

  function relayTo(url: string, maxAttempts = 100): OutboxRelay {
    return new OutboxRelay(outbox, config({ NOTIFICATIONS_URL: url, OUTBOX_MAX_ATTEMPTS: maxAttempts }));
  }

  function settlement(relay: OutboxRelay, events: Pick<OutboxRepository, 'enqueue'> = outbox): SettlementService {
    return new SettlementService(
      intents,
      {} as never,
      invoices,
      ledger as never,
      db,
      events as never,
      relay,
    );
  }

  async function processingIntent(key: string) {
    const { intent } = await intents.create({
      partyId: 'party_1',
      direction: 'DEPOSIT',
      amount: '250.00',
      currency: 'USD',
      walletId: 'wal_1',
      rail: 'stub',
      idempotencyKey: key,
    });
    await intents.recordRailAccepted(intent.id, `ref_${key}`, 'PROCESSING');
    return (await intents.find(intent.id))!;
  }

  const outboxRows = async () =>
    (await raw.query('SELECT id, event, status, attempts, last_error FROM outbox ORDER BY created_at')).rows;

  beforeAll(async () => {
    raw = new Pool({ connectionString: TEST_DATABASE_URL });
    await raw.query(
      `DROP TABLE IF EXISTS outbox, statement_lines, invoices, payment_intents, beneficiaries,
                            bank_accounts, banks, schema_migrations CASCADE`,
    );
    db = new DbService(config({ DATABASE_URL: TEST_DATABASE_URL }));
    await db.onModuleInit();
    intents = new IntentsRepository(db);
    invoices = new InvoicesRepository(db);
    outbox = new OutboxRepository(db);
    notifications = new FakeNotifications();
    await notifications.start();
  });

  afterAll(async () => {
    await notifications.stop();
    await db.onModuleDestroy();
    await raw.end();
  });

  beforeEach(async () => {
    await raw.query('TRUNCATE outbox, invoices, payment_intents CASCADE');
    notifications.status = 200;
    notifications.received = [];
  });

  it('survives notifications being down at settlement, and is delivered once it is back', async () => {
    notifications.status = 503;
    const relay = relayTo(notifications.url);
    const intent = await processingIntent('down-then-up');

    await settlement(relay).settle(intent, '250.00');
    await relay.drain();

    // Settled, and the event is still owed rather than gone.
    expect((await intents.find(intent.id))!.status).toBe('SETTLED');
    let [row] = await outboxRows();
    expect(row).toMatchObject({ event: 'payment.settled', status: 'PENDING' });
    expect(row.attempts).toBeGreaterThanOrEqual(1);
    expect(row.last_error).toContain('503');

    notifications.status = 200;
    await raw.query('UPDATE outbox SET next_attempt_at = now()');
    await relay.drain();

    [row] = await outboxRows();
    expect(row.status).toBe('PUBLISHED');
    expect(notifications.received).toHaveLength(1);
    expect(notifications.received[0]).toMatchObject({
      event: 'payment.settled',
      partyId: 'party_1',
      // The row id is the key notifications dedupes a replay on.
      dedupeKey: row.id,
      payload: expect.objectContaining({ intentId: intent.id, ledgerTxId: 'tx_1' }),
    });
  });

  it('retries when notifications refuses connections entirely', async () => {
    // A port nothing listens on: the shape of notifications mid-redeploy.
    const closed = new FakeNotifications();
    await closed.start();
    await closed.stop();
    const relay = relayTo(closed.url);

    await settlement(relay).settle(await processingIntent('refused'), '250.00');
    await relay.drain();

    const [row] = await outboxRows();
    expect(row.status).toBe('PENDING');
    expect(row.last_error).toContain('unreachable');
  });

  it('rolls the status change back when the event cannot be written', async () => {
    // The guarantee the table exists for, from the other side: no SETTLED
    // intent without its event. A throwing enqueue must take markSettled
    // down with it.
    const relay = relayTo(notifications.url);
    const intent = await processingIntent('rollback');
    const broken = {
      enqueue: async () => {
        throw new Error('outbox write failed');
      },
    };

    await expect(settlement(relay, broken).settle(intent, '250.00')).rejects.toThrow('outbox write failed');

    const after = (await intents.find(intent.id))!;
    expect(after.status).toBe('PROCESSING');
    expect(after.ledgerTxId).toBe('');
    expect(await outboxRows()).toHaveLength(0);
  });

  it('writes one event for a duplicate settlement', async () => {
    const relay = relayTo(notifications.url);
    const intent = await processingIntent('dup');
    const service = settlement(relay);

    await service.settle(intent, '250.00');
    // The stale copy a second callback would hold: ledgerTxId still empty.
    await service.settle(intent, '250.00');
    await relay.drain();

    expect(await outboxRows()).toHaveLength(1);
    expect(notifications.received).toHaveLength(1);
  });

  it('writes payment.failed once, and never after the intent settled', async () => {
    const relay = relayTo(notifications.url);
    const service = settlement(relay);

    const failing = await processingIntent('fail');
    await service.onRailCallback('stub', { railRef: 'ref_fail', status: 'FAILED', failureReason: 'bank said no', raw: {} });
    await service.onRailCallback('stub', { railRef: 'ref_fail', status: 'FAILED', failureReason: 'again', raw: {} });

    const settled = await processingIntent('late-fail');
    await service.settle(settled, '250.00');
    await service.onRailCallback('stub', { railRef: 'ref_late-fail', status: 'FAILED', raw: {} });
    await relay.drain();

    const events = (await outboxRows()).map((r) => r.event).sort();
    expect(events).toEqual(['payment.failed', 'payment.settled']);
    expect((await intents.find(failing.id))!.failureReason).toBe('bank said no');
    expect((await intents.find(settled.id))!.status).toBe('SETTLED');
  });

  it('dead-letters an event notifications rejects as malformed', async () => {
    notifications.status = 422;
    const relay = relayTo(notifications.url);
    await settlement(relay).settle(await processingIntent('poison'), '250.00');
    await relay.drain();

    const [row] = await outboxRows();
    expect(row.status).toBe('DEAD');
  });

  it('dead-letters after the attempt budget is spent', async () => {
    notifications.status = 503;
    const relay = relayTo(notifications.url, 2);
    await settlement(relay).settle(await processingIntent('budget'), '250.00');
    await relay.drain();
    await raw.query('UPDATE outbox SET next_attempt_at = now()');
    await relay.drain();

    const [row] = await outboxRows();
    expect(row).toMatchObject({ status: 'DEAD', attempts: 2 });
  });

  it('hands each row to exactly one of several concurrent relays', async () => {
    // Every payments replica runs a relay. SKIP LOCKED is what stops two of
    // them telling the customer twice.
    for (let i = 0; i < 40; i++) {
      await db.transaction((q) =>
        outbox.enqueue(q, { event: 'payment.settled', partyId: `party_${i}`, payload: { i } }),
      );
    }
    const relays = [relayTo(notifications.url), relayTo(notifications.url), relayTo(notifications.url)];
    await Promise.all(relays.map((r) => r.drain()));

    const keys = notifications.received.map((r) => r.dedupeKey);
    expect(keys).toHaveLength(40);
    expect(new Set(keys).size).toBe(40);
    expect((await outboxRows()).every((r) => r.status === 'PUBLISHED')).toBe(true);
  });

  it('writes invoice.issued in the same transaction as the invoice', async () => {
    const relay = relayTo(notifications.url);
    const controller = new InvoicesController(
      invoices,
      {} as never,
      {} as never,
      {} as never,
      db,
      outbox,
      relay,
      config({ PUBLIC_APP_URL: 'http://localhost:5173' }),
    );

    const rendered = (await controller.create('issuer_1', {
      amount: '10.00',
      currency: 'USD',
      payerPartyId: 'payer_1',
    })) as { id: string };
    await relay.drain();

    expect(notifications.received).toEqual([
      expect.objectContaining({
        event: 'invoice.issued',
        partyId: 'payer_1',
        payload: expect.objectContaining({ invoiceId: rendered.id }),
      }),
    ]);
  });
});

describe('backoffSeconds', () => {
  it('doubles from one second and caps at five minutes', () => {
    expect([1, 2, 3, 9, 10, 100].map(backoffSeconds)).toEqual([1, 2, 4, 256, 300, 300]);
  });
});

describe('payments outbox metrics', () => {
  it('exposes the backlog, deliveries and dead letters on the service registry', async () => {
    const metrics = new PlatformMetricsService('payments');
    const outbox = {
      pendingCount: async () => 3,
      claim: jest
        .fn()
        .mockResolvedValueOnce([
          { id: 'evt_ok', event: 'payment.settled', party_id: 'p', payload: {}, attempts: 1 },
          { id: 'evt_bad', event: 'invoice.issued', party_id: 'p', payload: {}, attempts: 1 },
        ])
        .mockResolvedValue([]),
      markPublished: async () => undefined,
      markFailed: async () => undefined,
    };
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 422 }));
    try {
      const relay = new OutboxRelay(outbox as never, config({ NOTIFICATIONS_URL: 'http://notifications' }), metrics);
      await relay.drain();
    } finally {
      fetchSpy.mockRestore();
    }

    const text = await metrics.metricsText();
    expect(text).toMatch(/payments_outbox_pending_events\{service="payments"\} 3/);
    expect(text).toMatch(/payments_outbox_delivered_total\{event="payment.settled",service="payments"\} 1/);
    expect(text).toMatch(/payments_outbox_dead_lettered_total\{event="invoice.issued",service="payments"\} 1/);
  });
});
