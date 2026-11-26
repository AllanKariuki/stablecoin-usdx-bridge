import { ConfigService } from '@nestjs/config';
import { HttpException, NotFoundException } from '@nestjs/common';
import { LedgerError } from '../src/core-ledger/core-ledger.client';
import { IntentsService } from '../src/intents/intents.service';

/**
 * Slice 4a's create-flow rules: a payer may pick a source wallet
 * (`sourceWalletId`), and that choice decides the whole shape of the intent.
 *
 *   - same currency as the intent        → the wallet substitutes for the
 *     ensured one (several wallets can hold one currency);
 *   - different currency, fiat/crypto    → a cross-currency TRANSFER that
 *     settles across the supplied quote;
 *   - different currency, USD-X source   → the two-step: the intent is
 *     CONVERTING and a redemption posts at creation.
 *
 * What is under test is the refusal and routing logic; the KYC gate passes
 * through (its own spec is intents-kyc-gate.spec.ts).
 */

const createdIntent = {
  id: 'pi_1',
  partyId: 'party_1',
  direction: 'TRANSFER' as const,
  amount: '1000.00',
  currency: 'KES',
  walletId: 'wal_1',
  bankAccountId: null,
  beneficiaryId: 'ben_1',
  invoiceId: null,
  rail: 'internal',
  railRef: '',
  status: 'REQUIRES_ACTION',
  ledgerTxId: '',
  idempotencyKey: 'key-1',
  description: '',
  failureReason: '',
  metadata: {},
  createdAt: new Date(),
  settledAt: null,
  sourceWalletId: null,
  sourceCurrency: null,
  quoteId: null,
  sourceAmount: null,
  conversionRef: '',
};

interface CreateCall {
  sourceWalletId?: string | null;
  sourceCurrency?: string | null;
  quoteId?: string | null;
  sourceAmount?: string | null;
  status?: string;
  walletId?: string;
}

function harness() {
  const config = {
    get: (key: string) => ({ KYC_MIN_TIER_FIAT: 'TIER_1' })[key],
  } as unknown as ConfigService;

  const calls = { ensured: [] as string[][], redeems: [] as Array<Record<string, unknown>>, recordRailAccepted: [] as Array<[string, string, string]> };
  const createCalls: CreateCall[] = [];
  let storedRef = '';
  const intents = {
    create: jest.fn(async (input: CreateCall) => {
      createCalls.push(input);
      return { intent: { ...createdIntent, ...input }, created: true };
    }),
    recordRailAccepted: jest.fn(async (id: string, railRef: string, status: string) => {
      calls.recordRailAccepted.push([id, railRef, status]);
    }),
    find: jest.fn(async () => ({
      ...createdIntent,
      ...createCalls[createCalls.length - 1],
      conversionRef: storedRef,
    })),
    markFailed: jest.fn(async () => true),
    setConversionRef: jest.fn(async (_id: string, ref: string) => {
      storedRef = ref;
      return true;
    }),
  };
  const ledger = {
    ensureWallet: jest.fn(async (party: string, currency: string) => {
      calls.ensured.push([party, currency]);
      return { id: `wal_${currency.toLowerCase()}_1`, user_id: party, currency, chain: '', status: 'ACTIVE' };
    }),
    getWallet: jest.fn(async (): Promise<unknown> => null),
    redeem: jest.fn(async () => {
      calls.redeems.push({});
      return { id: 'tx_r', type: 'USDX_REDEEM', status: 'POSTED', correlation_id: 'corr_1', saga_status: 'PENDING' };
    }),
  };
  const banks = {
    findAccount: jest.fn(async () => null),
    findBeneficiary: jest.fn(async () => ({
      id: 'ben_1',
      partyId: 'party_1',
      kind: 'WALLET',
      accountRef: '',
      name: 'Recipient',
      targetPartyId: 'party_2',
    })),
    availableBanks: jest.fn(async () => []),
  };
  const rails = {
    get: jest.fn(() => ({
      collect: jest.fn(async () => ({ status: 'REQUIRES_ACTION', railRef: 'rail_1', customerAction: '' })),
      disburse: jest.fn(async () => ({ status: 'REQUIRES_ACTION', railRef: 'rail_1', customerAction: '' })),
    })),
  };
  const db = {
    transaction: jest.fn(async (fn: (q: unknown) => Promise<unknown>) => fn({ query: jest.fn(async () => ({ rows: [] })) })),
  };

  const service = new IntentsService(
    intents as never,
    banks as never,
    ledger as never,
    rails as never,
    db as never,
    // The KYC gate is not what is under test here (its own spec is
    // intents-kyc-gate.spec.ts), so it passes through.
    { require: jest.fn(async () => undefined) } as never,
    config,
  );
  return { service, intents, ledger, banks, createCalls, calls };
}

async function rejection(promise: Promise<unknown>): Promise<{ status: number; code: string } | null> {
  try {
    await promise;
    return null;
  } catch (err) {
    // NotFoundException first: it is an HttpException whose response carries
    // a plain message rather than the {code} envelope.
    if (err instanceof NotFoundException) {
      return { status: 404, code: 'NOT_FOUND' };
    }
    if (err instanceof HttpException) {
      const response = err.getResponse() as { code?: string };
      return { status: err.getStatus(), code: response.code ?? '' };
    }
    throw err;
  }
}

const input = (over: Record<string, unknown> = {}) => ({
  partyId: 'party_1',
  direction: 'TRANSFER' as const,
  amount: '1000.00',
  currency: 'KES',
  beneficiaryId: 'ben_1',
  idempotencyKey: 'key-1',
  ...over,
});

const BTC_WALLET = { id: 'wal_btc', user_id: 'party_1', currency: 'BTC', chain: 'bitcoin', status: 'ACTIVE' };
const USDX_WALLET = { id: 'wal_usdx', user_id: 'party_1', currency: 'USDX', chain: 'ethereum', status: 'ACTIVE' };

describe('IntentsService source-wallet rules (slice 4a)', () => {
  it('uses a same-currency source wallet instead of ensuring one', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce({ ...USDX_WALLET, id: 'wal_kes', currency: 'KES' });

    await h.service.create(input({ sourceWalletId: 'wal_kes' }));

    expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
    expect(h.createCalls[0]).toMatchObject({
      walletId: 'wal_kes',
      sourceWalletId: 'wal_kes',
      sourceCurrency: 'KES',
      quoteId: null,
      sourceAmount: null,
    });
    // The ordinary internal-transfer path proceeds (PROCESSING).
    expect(h.calls.recordRailAccepted).toEqual([['pi_1', 'internal_pi_1', 'PROCESSING']]);
  });

  it('404s "no such wallet" when the source wallet belongs to someone else', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce({ ...BTC_WALLET, user_id: 'party_2' });

    const err = await rejection(h.service.create(input({ sourceWalletId: 'wal_btc', quoteId: 'q_1', sourceAmount: '0.01' })));
    expect(err).toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
    expect(h.createCalls).toHaveLength(0);
  });

  it('404s "no such wallet" when the source wallet does not exist', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(null);

    const err = await rejection(h.service.create(input({ sourceWalletId: 'wal_nope' })));
    expect(err).toEqual({ status: 404, code: 'NOT_FOUND' });
    expect(h.createCalls).toHaveLength(0);
  });

  it('refuses a non-ACTIVE source wallet', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce({ ...BTC_WALLET, status: 'FROZEN' });

    const err = await rejection(h.service.create(input({ sourceWalletId: 'wal_btc', quoteId: 'q_1', sourceAmount: '0.01' })));
    expect(err?.status).toBe(400);
    expect(h.createCalls).toHaveLength(0);
  });

  it('stores the source fields for a cross-currency TRANSFER and settles through the internal path', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(BTC_WALLET);

    await h.service.create(input({ sourceWalletId: 'wal_btc', quoteId: 'q_1', sourceAmount: '0.01000000' }));

    expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
    expect(h.createCalls[0]).toMatchObject({
      walletId: 'wal_btc',
      sourceWalletId: 'wal_btc',
      sourceCurrency: 'BTC',
      quoteId: 'q_1',
      sourceAmount: '0.01000000',
      status: 'REQUIRES_ACTION',
    });
    expect(h.calls.recordRailAccepted).toEqual([['pi_1', 'internal_pi_1', 'PROCESSING']]);
  });

  it('422s QUOTE_REQUIRED for a cross-currency source without a quote', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(BTC_WALLET);

    const err = await rejection(h.service.create(input({ sourceWalletId: 'wal_btc' })));
    expect(err).toEqual({ status: 422, code: 'QUOTE_REQUIRED' });
    expect(h.createCalls).toHaveLength(0);
  });

  it('422s SOURCE_AMOUNT_REQUIRED for a cross-currency source without the pinned amount', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(BTC_WALLET);

    const err = await rejection(h.service.create(input({ sourceWalletId: 'wal_btc', quoteId: 'q_1' })));
    expect(err).toEqual({ status: 422, code: 'SOURCE_AMOUNT_REQUIRED' });
    expect(h.createCalls).toHaveLength(0);
  });

  it('422s CROSS_CURRENCY_RAIL_UNSUPPORTED for a cross-currency DEPOSIT or WITHDRAWAL', async () => {
    const h = harness();
    // Every iteration resolves the same wallet — the refusal is the test's
    // subject, not the lookup.
    h.ledger.getWallet.mockResolvedValue(BTC_WALLET);

    for (const direction of ['DEPOSIT', 'WITHDRAWAL'] as const) {
      const err = await rejection(
        h.service.create(input({ direction, sourceWalletId: 'wal_btc', quoteId: 'q_1', sourceAmount: '0.01' })),
      );
      expect(err).toEqual({ status: 422, code: 'CROSS_CURRENCY_RAIL_UNSUPPORTED' });
    }
    expect(h.createCalls).toHaveLength(0);
    expect(h.ledger.ensureWallet).not.toHaveBeenCalled();
  });

  it('422s CROSS_CURRENCY_RAIL_UNSUPPORTED when a cross-currency TRANSFER has no WALLET beneficiary', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(BTC_WALLET);
    h.banks.findBeneficiary.mockResolvedValueOnce({
      id: 'ben_1',
      partyId: 'party_1',
      kind: 'BANK',
      accountRef: '254700000000',
      name: 'Bank Account',
      targetPartyId: '',
    });

    const err = await rejection(
      h.service.create(input({ sourceWalletId: 'wal_btc', quoteId: 'q_1', sourceAmount: '0.01' })),
    );
    expect(err).toEqual({ status: 422, code: 'CROSS_CURRENCY_RAIL_UNSUPPORTED' });
    expect(h.createCalls).toHaveLength(0);
  });

  it('creates a CONVERTING intent and posts the redemption for a USD-X source into USD', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(USDX_WALLET);

    const intent = await h.service.create(input({ currency: 'USD', amount: '10.00', sourceWalletId: 'wal_usdx' }));

    expect(h.createCalls[0]).toMatchObject({
      walletId: 'wal_usdx',
      sourceWalletId: 'wal_usdx',
      sourceCurrency: 'USDX',
      quoteId: null,
      sourceAmount: '10.00', // the redemption amount: USD-X 1:1
      status: 'CONVERTING',
    });
    // The redemption posted with the intent-derived idempotency key, and the
    // saga's correlation id was stored for the poller.
    expect(h.ledger.redeem).toHaveBeenCalledWith({
      usdxWalletId: 'wal_usdx',
      fiatWalletId: 'wal_usd_1',
      amount: '10.00',
      idempotencyKey: 'payments:pi_1:redeem',
      actor: 'party_1',
    });
    expect(h.intents.setConversionRef).toHaveBeenCalledWith('pi_1', 'corr_1');
    // CONVERTING is not an internal PROCESSING intent: nothing settles inline.
    expect(h.calls.recordRailAccepted).toHaveLength(0);
    expect(intent.conversionRef).toBe('corr_1');
  });

  it('creates a CONVERTING intent with the quote stored for a USD-X source into another currency', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(USDX_WALLET);

    await h.service.create(input({ sourceWalletId: 'wal_usdx', quoteId: 'q_1', sourceAmount: '7.80' }));

    expect(h.createCalls[0]).toMatchObject({
      sourceCurrency: 'USDX',
      quoteId: 'q_1',
      sourceAmount: '7.80',
      status: 'CONVERTING',
    });
    expect(h.ledger.redeem).toHaveBeenCalledWith(expect.objectContaining({ amount: '7.80' }));
  });

  it('422s QUOTE_REQUIRED for a USD-X source into a non-USD currency without a quote', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(USDX_WALLET);

    const err = await rejection(h.service.create(input({ sourceWalletId: 'wal_usdx' })));
    expect(err).toEqual({ status: 422, code: 'QUOTE_REQUIRED' });
    expect(h.createCalls).toHaveLength(0);
  });

  it('fails the intent and re-throws the ledger code when the redemption is refused terminally', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(USDX_WALLET);
    h.ledger.redeem.mockRejectedValueOnce(new LedgerError('rejected', 409, '{"code":"INSUFFICIENT_FUNDS"}'));

    const err = await rejection(h.service.create(input({ currency: 'USD', amount: '10.00', sourceWalletId: 'wal_usdx' })));
    expect(err).toEqual({ status: 409, code: 'INSUFFICIENT_FUNDS' });
    expect(h.intents.markFailed).toHaveBeenCalledWith(
      'pi_1',
      expect.stringContaining('INSUFFICIENT_FUNDS'),
      expect.anything(), // the transaction the status change commits in
    );
  });

  it('leaves the intent CONVERTING on a don\'t-know redemption and lets the poller re-post', async () => {
    const h = harness();
    h.ledger.getWallet.mockResolvedValueOnce(USDX_WALLET);
    h.ledger.redeem.mockRejectedValueOnce(new LedgerError('upstream', 503, 'unavailable'));

    const intent = await h.service.create(input({ currency: 'USD', amount: '10.00', sourceWalletId: 'wal_usdx' }));

    expect(intent.status).toBe('CONVERTING');
    // The row's conversion_ref stayed empty: the poller's recovery re-posts
    // the redemption under the same idempotency key.
    expect(intent.conversionRef).toBe('');
    expect(h.intents.markFailed).not.toHaveBeenCalled();
  });
});
