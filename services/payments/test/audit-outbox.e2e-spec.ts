import { randomUUID } from 'node:crypto';
import { AUDIT } from '../src/audit/audit-actions';
import { BanksController } from '../src/banks/banks.controller';
import { BanksRepository } from '../src/banks/banks.repository';
import { DbService } from '../src/db/db.service';
import { IntentsRepository } from '../src/intents/intents.repository';
import { IntentsService } from '../src/intents/intents.service';
import { SettlementService } from '../src/intents/settlement.service';
import { InvoicesController } from '../src/invoices/invoices.controller';
import { InvoicesRepository } from '../src/invoices/invoices.repository';
import { OutboxRelay } from '../src/outbox/outbox.relay';
import { OutboxRepository } from '../src/outbox/outbox.repository';

/**
 * Real Postgres, in payments_test. Rails, core-ledger and notifications are
 * stand-ins; what is under test is that each customer- or rail-driven change
 * and its audit event commit or roll back together.
 */
const TEST_DATABASE_URL =
  process.env.PAYMENTS_TEST_DATABASE_URL ??
  'postgres://payments:payments@localhost:55433/payments_test?sslmode=disable';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as never;

describe('payments audit producer (real Postgres)', () => {
  let db: DbService;
  let intents: IntentsRepository;
  let invoices: InvoicesRepository;
  let banks: BanksRepository;
  let outbox: OutboxRepository;
  let relay: OutboxRelay;
  let service: IntentsService;

  const ledger = {
    ensureWallet: async (partyId: string) => ({ id: `wal_${partyId}`, user_id: partyId, currency: 'USD', chain: '' }),
    deposit: async () => ({ id: `tx_${randomUUID()}`, type: 'FIAT_DEPOSIT', status: 'POSTED', created_at: '' }),
  };
  const rails = {
    get: () => ({
      name: 'stub',
      collect: async () => ({ railRef: `stub_${randomUUID()}`, status: 'PROCESSING' }),
      disburse: async () => ({ railRef: '', status: 'FAILED', failureReason: 'account closed' }),
    }),
  };

  function settlement(events: Pick<OutboxRepository, 'enqueue'> = outbox): SettlementService {
    return new SettlementService(intents, banks, invoices, ledger as never, db, events as never, relay);
  }

  beforeAll(async () => {
    db = new DbService(config({ DATABASE_URL: TEST_DATABASE_URL }));
    await db.onModuleInit();
    intents = new IntentsRepository(db);
    invoices = new InvoicesRepository(db);
    banks = new BanksRepository(db);
    outbox = new OutboxRepository(db);
    relay = new OutboxRelay(outbox, config({ NOTIFICATIONS_URL: '' }));
    service = new IntentsService(intents, banks, ledger as never, rails as never, db);
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

  async function deposit(partyId = `party_${randomUUID()}`) {
    return service.create({
      partyId,
      direction: 'DEPOSIT',
      amount: '25.00',
      currency: 'USD',
      idempotencyKey: randomUUID(),
      audit: { requestId: 'gw-p1', sourceIp: '203.0.113.9' },
    });
  }

  it('audits an intent once, with the customer as actor, and an idempotent retry not at all', async () => {
    const partyId = `party_${randomUUID()}`;
    const key = randomUUID();
    const input = { partyId, direction: 'DEPOSIT' as const, amount: '25.00', currency: 'USD', idempotencyKey: key };
    const first = await service.create(input);
    await service.create(input);

    const events = await auditFor(first.id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.intentCreated]);
    expect(events[0].payload).toMatchObject({
      actor: partyId,
      after_state: { direction: 'DEPOSIT', amount: '25.00', currency: 'USD' },
      metadata: { idempotencyKey: key },
    });
  });

  it('audits a rail callback settlement with the rail as actor and the callback source', async () => {
    const intent = await deposit();
    await settlement().onRailCallback('stub', { railRef: intent.railRef, status: 'SETTLED', raw: {} }, {
      sourceIp: '198.51.100.20',
    });

    const events = await auditFor(intent.id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.intentCreated, AUDIT.intentSettled]);
    expect(events[1].payload).toMatchObject({
      actor: 'rail:stub',
      on_behalf_of: intent.partyId,
      source_ip: '198.51.100.20',
      before_state: { status: 'PROCESSING' },
      after_state: { status: 'SETTLED', amount: '25.00' },
    });
  });

  it('audits a callback reporting the wrong amount as DENIED and settles nothing', async () => {
    const intent = await deposit();
    await settlement().onRailCallback('stub', { railRef: intent.railRef, status: 'SETTLED', amount: '9999.00', raw: {} });

    const events = await auditFor(intent.id);
    expect(events.map((e) => [e.action, e.payload.outcome])).toEqual([
      [AUDIT.intentCreated, 'SUCCESS'],
      [AUDIT.settlementRefused, 'DENIED'],
    ]);
    expect((await intents.find(intent.id))!.status).toBe('PROCESSING');
  });

  it('rolls the settlement audit event back with the settlement', async () => {
    const intent = await deposit();
    const broken = {
      enqueue: async () => {
        throw new Error('outbox write failed');
      },
    };
    await expect(settlement(broken).settle(intent, intent.amount)).rejects.toThrow('outbox write failed');

    expect((await auditFor(intent.id)).map((e) => e.action)).toEqual([AUDIT.intentCreated]);
    expect((await intents.find(intent.id))!.status).toBe('PROCESSING');
  });

  it('audits a payout the rail refused at initiation as a FAILURE', async () => {
    const partyId = `party_${randomUUID()}`;
    const controller = new BanksController(banks, db);
    const account = await controller.register(partyId, {
      bankId: 'bank_chase',
      accountName: 'Payee',
      accountNumber: String(Date.now()).slice(-8),
    });
    await controller.link(partyId, { accountId: account.id });

    await expect(
      service.create({
        partyId,
        direction: 'WITHDRAWAL',
        amount: '5.00',
        currency: 'USD',
        bankAccountId: account.id,
        idempotencyKey: randomUUID(),
      }),
    ).resolves.toMatchObject({ status: 'FAILED' });

    const { rows } = await db.query<{ id: string }>(
      `SELECT id FROM payment_intents WHERE party_id = $1 AND direction = 'WITHDRAWAL'`,
      [partyId],
    );
    const events = await auditFor(rows[0].id);
    expect(events.map((e) => [e.action, e.payload.outcome])).toEqual([
      [AUDIT.intentCreated, 'SUCCESS'],
      [AUDIT.intentFailed, 'FAILURE'],
    ]);
  });

  it('audits every change to where money may be sent', async () => {
    const partyId = `party_${randomUUID()}`;
    const controller = new BanksController(banks, db);
    const account = await controller.register(partyId, {
      bankId: 'bank_chase',
      accountName: 'Me',
      accountNumber: '000123456789',
    });
    await controller.link(partyId, { accountId: account.id });
    await controller.remove(partyId, account.id);
    const beneficiary = await controller.addBeneficiary(partyId, { name: 'Bob', accountRef: `acc_${randomUUID()}`, currency: 'USD' });

    const events = await auditFor(account.id);
    expect(events.map((e) => e.action)).toEqual([
      AUDIT.bankAccountRegistered,
      AUDIT.bankAccountVerified,
      AUDIT.bankAccountRemoved,
    ]);
    // The full account number is never stored, so it can't be in an event.
    expect(JSON.stringify(events)).not.toContain('000123456789');
    expect((await auditFor(beneficiary.id)).map((e) => e.payload.actor)).toEqual([partyId]);
  });

  it('audits invoice issue and void, and a void that matches nothing not at all', async () => {
    const controller = new InvoicesController(invoices, {} as never, {} as never, {} as never, db, outbox, relay, config({}));
    const issuer = `party_${randomUUID()}`;
    const invoice = (await controller.create(issuer, { amount: '10.00', currency: 'USD', payerPartyId: 'payer_1' })) as {
      id: string;
    };
    await controller.void(issuer, invoice.id);
    await expect(controller.void(issuer, invoice.id)).rejects.toThrow();

    const events = await auditFor(invoice.id);
    expect(events.map((e) => e.action)).toEqual([AUDIT.invoiceIssued, AUDIT.invoiceVoided]);
    expect(events[1].payload).toMatchObject({ before_state: { status: 'OPEN' }, after_state: { status: 'VOID' } });
  });
});
