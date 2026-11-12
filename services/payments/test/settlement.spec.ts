import { LedgerError } from '../src/core-ledger/core-ledger.client';
import { SettlementService } from '../src/intents/settlement.service';
import { PaymentIntent } from '../src/intents/intents.repository';
import { RailCallback } from '../src/rails/rail-provider';

/**
 * Settlement is the code that decides money moved, so these tests are about
 * the four things that can go wrong with that decision:
 *
 *   1. a duplicate callback posting a second journal transaction;
 *   2. an intent marked SETTLED with nothing behind it in the ledger;
 *   3. an intent marked FAILED when the ledger's answer was "I don't know",
 *      after the rail has already moved the money;
 *   4. settling the amount that was *requested* when the rail moved another;
 *   5. a settlement or failure that commits without the outbox event telling
 *      the customer about it (or with two of them).
 *
 * Every real rail delivers callbacks at-least-once, so (1) is routine rather
 * than exceptional.
 */

function intent(over: Partial<PaymentIntent> = {}): PaymentIntent {
  return {
    id: 'pi_1',
    partyId: 'party_1',
    direction: 'DEPOSIT',
    amount: '250.00',
    currency: 'USD',
    walletId: 'wal_1',
    bankAccountId: null,
    beneficiaryId: null,
    invoiceId: null,
    rail: 'stub',
    railRef: 'stub_collect_abc',
    status: 'PROCESSING',
    ledgerTxId: '',
    idempotencyKey: 'key-1',
    description: '',
    failureReason: '',
    metadata: {},
    createdAt: new Date(),
    settledAt: null,
    ...over,
  };
}

function harness(over: { current?: PaymentIntent; settleWins?: boolean } = {}) {
  const current = over.current ?? intent();
  const calls = { deposits: 0, withdrawals: 0, transfers: 0, markSettled: 0, markFailed: [] as string[] };
  let settled = over.settleWins ?? true;

  const intents = {
    findByRailRef: jest.fn(async () => current),
    find: jest.fn(async () => current),
    markSettled: jest.fn(async () => {
      calls.markSettled += 1;
      const won = settled;
      // Only the first caller wins, exactly as the SQL guard does.
      settled = false;
      return won;
    }),
    markFailed: jest.fn(async (_id: string, reason: string) => {
      calls.markFailed.push(reason);
      return true;
    }),
  };

  const ledger = {
    deposit: jest.fn(async () => {
      calls.deposits += 1;
      return { id: 'tx_1', type: 'FIAT_DEPOSIT', status: 'POSTED', created_at: '' };
    }),
    withdraw: jest.fn(async () => {
      calls.withdrawals += 1;
      return { id: 'tx_2', type: 'FIAT_WITHDRAWAL', status: 'POSTED', created_at: '' };
    }),
    transfer: jest.fn(async () => {
      calls.transfers += 1;
      return { id: 'tx_3', type: 'INTERNAL_TRANSFER', status: 'POSTED', created_at: '' };
    }),
    ensureWallet: jest.fn(async () => ({ id: 'wal_2', user_id: 'party_2', currency: 'USD', chain: '' })),
  };

  const banks = { findBeneficiary: jest.fn(async () => null) };
  const invoices = { markPaid: jest.fn(async () => undefined) };
  // A transaction that runs its callback against a marker executor, so the
  // tests can assert that every write which must commit together was handed
  // the same one. The real rollback behaviour is covered against Postgres in
  // outbox.e2e-spec.ts.
  const tx = { query: jest.fn() };
  const db = { transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => fn(tx)) };
  const outbox = { enqueue: jest.fn(async () => 'evt_1') };
  const relay = { kick: jest.fn() };

  const service = new SettlementService(
    intents as never,
    banks as never,
    invoices as never,
    ledger as never,
    db as never,
    outbox as never,
    relay as never,
  );

  return { service, intents, ledger, banks, invoices, db, tx, outbox, relay, calls, current };
}

const callback = (over: Partial<RailCallback> = {}): RailCallback => ({
  railRef: 'stub_collect_abc',
  status: 'SETTLED',
  raw: {},
  ...over,
});

describe('SettlementService', () => {
  it('posts one journal transaction and marks the intent settled', async () => {
    const h = harness();
    await h.service.onRailCallback('stub', callback());

    expect(h.calls.deposits).toBe(1);
    expect(h.intents.markSettled).toHaveBeenCalledWith('pi_1', 'tx_1', h.tx);
  });

  it('writes the payment.settled event in the same transaction as the status change', async () => {
    // Before the outbox this was a POST after the fact, and a notifications
    // outage at that moment meant the customer was never told.
    const h = harness();
    await h.service.onRailCallback('stub', callback());

    expect(h.db.transaction).toHaveBeenCalledTimes(1);
    expect(h.outbox.enqueue).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({
        event: 'payment.settled',
        partyId: 'party_1',
        payload: expect.objectContaining({ intentId: 'pi_1', amount: '250.00', ledgerTxId: 'tx_1' }),
      }),
    );
    // Kicked only after the transaction resolved, so the relay can see the row.
    expect(h.relay.kick).toHaveBeenCalledTimes(1);
  });

  it('does nothing for a callback on an intent that is already settled', async () => {
    // The guard that makes at-least-once delivery harmless. An already-set
    // ledger_tx_id means a previous callback got there first.
    const h = harness({ current: intent({ ledgerTxId: 'tx_1', status: 'SETTLED' }) });
    await h.service.onRailCallback('stub', callback());

    expect(h.calls.deposits).toBe(0);
    expect(h.intents.markSettled).not.toHaveBeenCalled();
  });

  it('does not notify twice when two callbacks race', async () => {
    // Both post the same idempotency key, so core-ledger returns the same
    // transaction to both and nothing moves twice — but only the caller that
    // wins the UPDATE should tell the customer their money arrived.
    const h = harness();
    await h.service.settle(h.current, '250.00');
    await h.service.settle(h.current, '250.00');

    expect(h.calls.markSettled).toBe(2);
    expect(h.outbox.enqueue).toHaveBeenCalledTimes(1);
  });

  it('does not book an amount the callback chose, leaving the intent for review', async () => {
    // A callback that disagrees with the intent may be a partial collection,
    // a fee, or forged. None of those may be booked automatically.
    const h = harness();
    await h.service.onRailCallback('stub', callback({ amount: '99999.00' }));

    expect(h.ledger.deposit).not.toHaveBeenCalled();
    expect(h.calls.markSettled).toBe(0);
  });

  it('settles when the callback amount matches the intent', async () => {
    const h = harness();
    await h.service.onRailCallback('stub', callback({ amount: '250.00' }));

    expect(h.ledger.deposit).toHaveBeenCalledWith(expect.objectContaining({ amount: '250.00' }));
  });

  it('derives the ledger idempotency key from the intent, never randomly', async () => {
    const h = harness();
    await h.service.onRailCallback('stub', callback());

    expect(h.ledger.deposit).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: 'payments:pi_1' }));
  });

  it('fails the intent when the ledger refuses terminally', async () => {
    // A 4xx is the ledger saying this movement is not allowed and will say so
    // identically forever — overdrawn, frozen, closed period.
    const h = harness();
    h.ledger.withdraw.mockRejectedValueOnce(
      new LedgerError('rejected', 409, '{"code":"INSUFFICIENT_FUNDS"}'),
    );
    const withdrawal = intent({ direction: 'WITHDRAWAL' });
    h.intents.findByRailRef.mockResolvedValueOnce(withdrawal);

    await h.service.onRailCallback('stub', callback());

    expect(h.calls.markFailed).toHaveLength(1);
    expect(h.calls.markFailed[0]).toContain('INSUFFICIENT_FUNDS');
  });

  it('does NOT fail the intent when the ledger answer is unknown', async () => {
    // The most important case here. A 5xx or a network error means the rail
    // moved the money and we cannot tell whether the ledger recorded it.
    // Marking FAILED would be a lie; re-throwing makes the rail retry, and the
    // idempotency key makes that retry safe.
    const h = harness();
    h.ledger.deposit.mockRejectedValueOnce(new LedgerError('upstream', 503, 'service unavailable'));

    await expect(h.service.onRailCallback('stub', callback())).rejects.toThrow();
    expect(h.calls.markFailed).toHaveLength(0);
    expect(h.intents.markSettled).not.toHaveBeenCalled();
    expect(h.outbox.enqueue).not.toHaveBeenCalled();
  });

  it('marks an intent failed when the rail reports failure', async () => {
    const h = harness();
    await h.service.onRailCallback('stub', callback({ status: 'FAILED', failureReason: 'insufficient funds at bank' }));

    expect(h.calls.deposits).toBe(0);
    expect(h.calls.markFailed[0]).toBe('insufficient funds at bank');
    expect(h.outbox.enqueue).toHaveBeenCalledWith(
      h.tx,
      expect.objectContaining({ event: 'payment.failed', payload: expect.objectContaining({ reason: 'insufficient funds at bank' }) }),
    );
  });

  it('does not emit payment.failed when the intent was already terminal', async () => {
    // A late failure callback for money that already landed, or a rail
    // repeating its failure: the status guard updates nothing, and the
    // customer must not be told their payment failed (again, or wrongly).
    const h = harness();
    h.intents.markFailed.mockResolvedValueOnce(false);
    await h.service.onRailCallback('stub', callback({ status: 'FAILED', failureReason: 'late' }));

    expect(h.outbox.enqueue).not.toHaveBeenCalled();
    expect(h.relay.kick).not.toHaveBeenCalled();
  });

  it('waits rather than acting on a non-terminal rail status', async () => {
    const h = harness();
    await h.service.onRailCallback('stub', callback({ status: 'PROCESSING' }));

    expect(h.calls.deposits).toBe(0);
    expect(h.calls.markFailed).toHaveLength(0);
  });

  it('ignores a callback whose reference matches no intent', async () => {
    // Not an error worth throwing over: 500-ing at a rail makes it retry
    // forever, and a reference this platform never issued is either another
    // tenant's or a replay from before a database reset.
    const h = harness();
    h.intents.findByRailRef.mockResolvedValueOnce(null as never);

    await expect(h.service.onRailCallback('stub', callback({ railRef: 'nope' }))).resolves.toBeUndefined();
    expect(h.calls.deposits).toBe(0);
  });

  it('marks the invoice paid when the intent settles one', async () => {
    const h = harness({ current: intent({ direction: 'WITHDRAWAL', invoiceId: 'inv_1' }) });
    await h.service.onRailCallback('stub', callback());

    expect(h.invoices.markPaid).toHaveBeenCalledWith('inv_1', 'pi_1', h.tx);
  });
});
