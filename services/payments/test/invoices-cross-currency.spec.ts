import { ConfigService } from '@nestjs/config';
import { InvoicesController } from '../src/invoices/invoices.controller';

/**
 * Slice 4a's invoice-pay pass-through: paying an invoice from another
 * currency carries the source wallet, the TO-side quote minted for the
 * invoice amount, and the quote's pinned from_amount — all handed to the
 * same IntentsService.create the plain pay uses, so the rules live in one
 * place. The settlement side (the net-vs-invoice check) is covered in
 * settlement.spec.ts.
 */

function harness() {
  const invoice = {
    id: 'inv_1',
    number: 'INV-2026-0001',
    issuerPartyId: 'party_2',
    payerPartyId: 'party_1',
    amount: '1000.00',
    currency: 'KES',
    status: 'OPEN',
    description: '',
  };
  const createCalls: Array<Record<string, unknown>> = [];
  const repo = {
    find: jest.fn(async () => invoice),
  };
  const intents = {
    create: jest.fn(async (input: Record<string, unknown>) => {
      createCalls.push(input);
      return {
        id: 'pi_1',
        status: 'PROCESSING',
        rail: 'internal',
        amount: input.amount,
        currency: input.currency,
      };
    }),
  };
  const intentsRepo = {
    find: jest.fn(async () => ({
      id: 'pi_1',
      partyId: 'party_1',
      direction: 'TRANSFER',
      amount: '1000.00',
      currency: 'KES',
      walletId: 'wal_1',
      bankAccountId: null,
      beneficiaryId: 'ben_1',
      invoiceId: 'inv_1',
      rail: 'internal',
      railRef: '',
      status: 'SETTLED',
      ledgerTxId: 'tx_1',
      idempotencyKey: 'key-1',
      description: '',
      failureReason: '',
      metadata: {},
      createdAt: new Date(),
      settledAt: new Date(),
      sourceWalletId: 'wal_btc',
      sourceCurrency: 'BTC',
      quoteId: 'q_1',
      sourceAmount: '0.01000000',
      conversionRef: '',
    })),
  };
  const settlement = {
    settle: jest.fn(async () => undefined),
  };
  const config = {
    get: (key: string) => ({ PUBLIC_APP_URL: 'http://localhost:5173' })[key],
  } as unknown as ConfigService;

  const controller = new InvoicesController(
    repo as never,
    intents as never,
    intentsRepo as never,
    settlement as never,
    { transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => fn({ query: jest.fn(async () => ({ rows: [] })) })) } as never,
    { enqueue: jest.fn(async () => 'evt_1') } as never,
    { kick: jest.fn() } as never,
    config,
  );
  return { controller, repo, createCalls, settlement, intentsRepo };
}

const body = (over: Record<string, unknown> = {}) => ({
  beneficiaryId: 'ben_1',
  ...over,
});

describe('InvoicesController cross-currency pay (slice 4a)', () => {
  it('passes the source wallet, quote and pinned amount through to the intent', async () => {
    const h = harness();

    await h.controller.pay(
      'party_1',
      'key-1',
      'inv_1',
      body({ sourceWalletId: 'wal_btc', quoteId: 'q_1', sourceAmount: '0.01000000' }),
      {},
    );

    expect(h.createCalls[0]).toMatchObject({
      partyId: 'party_1',
      direction: 'TRANSFER',
      amount: '1000.00', // the invoice is fixed in the payee's currency
      currency: 'KES',
      invoiceId: 'inv_1',
      beneficiaryId: 'ben_1',
      sourceWalletId: 'wal_btc',
      quoteId: 'q_1',
      sourceAmount: '0.01000000',
    });
    // The internal transfer settles through the one settlement path.
    expect(h.settlement.settle).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'pi_1', rail: 'internal', status: 'PROCESSING' }),
      '1000.00',
      'party_1',
      {},
    );
  });

  it('pays an invoice with a USD-X source into USD without a quote (the 1:1 path)', async () => {
    const h = harness();
    h.repo.find.mockResolvedValueOnce({
      id: 'inv_2',
      number: 'INV-2026-0002',
      issuerPartyId: 'party_2',
      payerPartyId: 'party_1',
      amount: '10.00',
      currency: 'USD',
      status: 'OPEN',
      description: '',
    });

    await h.controller.pay('party_1', 'key-2', 'inv_2', body({ sourceWalletId: 'wal_usdx' }), {});

    expect(h.createCalls[0]).toMatchObject({
      currency: 'USD',
      sourceWalletId: 'wal_usdx',
      quoteId: undefined,
      sourceAmount: undefined,
    });
  });
});
