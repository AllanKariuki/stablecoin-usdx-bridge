import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';
import { CoreLedgerClient, TreasuryPosition } from '../src/core-ledger/core-ledger.client';
import { CustodianStatement, CustodiansRepository } from '../src/custodians/custodians.repository';
import { ExposureLimitsRepository } from '../src/exposure/exposure-limits.repository';
import { ExposureService } from '../src/exposure/exposure.service';

/**
 * The exposure gate, on fake dependencies: what matters is the arithmetic
 * at each currency's scale — a limit of "5" BTC is 5e8 satoshi, and a delta
 * of "-0.01" ETH is -1e16 wei — and the direction of every comparison. A
 * sign error here is a quote minted past the mandate, silently.
 */

function position(overrides: Partial<TreasuryPosition>): TreasuryPosition {
  return {
    currency: 'BTC',
    decimals: 8,
    customer_liabilities: '0.01000000',
    custody_holdings: '0.00000000',
    fx_position: '0.01000000',
    net_exposure: '-0.01000000',
    ...overrides,
  };
}

function service(overrides: {
  positions?: TreasuryPosition[];
  limits?: { maxShort: string; maxLong: string } | null;
  statements?: CustodianStatement[];
  tolerance?: string;
}): { svc: ExposureService; limits: jest.Mock; custodians: jest.Mock } {
  const limitRow =
    overrides.limits === undefined
      ? { currency: 'BTC', maxShort: '5', maxLong: '5', updatedBy: 'seed', updatedAt: new Date() }
      : overrides.limits
        ? { currency: 'BTC', ...overrides.limits, updatedBy: 'seed', updatedAt: new Date() }
        : null;

  const limitsRepo = {
    find: jest.fn(async () => limitRow),
    list: jest.fn(async () => (limitRow ? [limitRow] : [])),
  } as unknown as ExposureLimitsRepository;

  const custodiansRepo = {
    latestStatements: jest.fn(async () => overrides.statements ?? []),
  } as unknown as CustodiansRepository;

  const ledger = {
    treasuryPositions: jest.fn(async () => overrides.positions ?? [position({})]),
  } as unknown as CoreLedgerClient;

  const config = {
    get: (key: string) => (key === 'CRYPTO_RECON_TOLERANCE' ? (overrides.tolerance ?? '0') : undefined),
  } as unknown as ConfigService;

  const svc = new ExposureService(ledger, limitsRepo, custodiansRepo, config);
  return {
    svc,
    limits: limitsRepo.find as unknown as jest.Mock,
    custodians: custodiansRepo.latestStatements as unknown as jest.Mock,
  };
}

describe('ExposureService.check', () => {
  it('allows a quote that deepens the short but stays inside the mandate', async () => {
    const { svc } = service({ limits: { maxShort: '5', maxLong: '5' } });
    // net -0.01, customers gain 0.5 -> projected -0.51, well inside -5.
    await expect(svc.check('BTC', '0.5')).resolves.toMatchObject({ ok: true, projected: '-0.51000000' });
  });

  it('refuses a quote that would breach the short side', async () => {
    const { svc } = service({
      positions: [position({ net_exposure: '-4.90000000' })],
      limits: { maxShort: '5', maxLong: '5' },
    });
    // projected -5.1 < -max_short: the house would be shorter than the
    // mandate allows.
    await expect(svc.check('BTC', '0.3')).rejects.toMatchObject({
      response: { code: 'EXPOSURE_LIMIT_EXCEEDED' },
    });
  });

  it('refuses a quote that would breach the long side', async () => {
    const { svc } = service({
      positions: [position({ net_exposure: '4.90000000', custody_holdings: '4.90000000', customer_liabilities: '0' })],
      limits: { maxShort: '5', maxLong: '5' },
    });
    // Customers giving crypto back moves the house long: -(-0.3) = +0.3,
    // projected 5.2 > +max_long.
    await expect(svc.check('BTC', '-0.3')).rejects.toMatchObject({
      response: { code: 'EXPOSURE_LIMIT_EXCEEDED' },
    });
  });

  it('fails closed with NO_EXPOSURE_POLICY when treasury set no limit for the currency', async () => {
    // An unset mandate is not permission: nobody has said how short the
    // house may run this currency, so no quote may be minted against it.
    const { svc } = service({ limits: null });
    await expect(svc.check('BTC', '999.9')).rejects.toMatchObject({
      response: {
        code: 'NO_EXPOSURE_POLICY',
        message: 'no exposure mandate is set for BTC; treasury must set one before it can be quoted',
      },
    });
  });

  it('refuses a delta that is not a decimal at the currency scale', async () => {
    const { svc } = service({});
    await expect(svc.check('BTC', '0.000000001')).rejects.toMatchObject({
      response: { code: 'INVALID_DELTA' },
    });
  });

  it('scales ETH deltas at 18 decimals, not at a fiat scale', async () => {
    const { svc } = service({
      positions: [position({ currency: 'ETH', decimals: 18, net_exposure: '-100.000000000000000000' })],
      limits: { maxShort: '100', maxLong: '100' },
    });
    // Exactly at the boundary: projected -100 - 0.000000000000000001 is one
    // wei past -100 and must be refused.
    await expect(svc.check('ETH', '0.000000000000000001')).rejects.toMatchObject({
      response: { code: 'EXPOSURE_LIMIT_EXCEEDED' },
    });
  });
});

describe('ExposureService.validateRebalance', () => {
  const input = {
    side: 'BUY',
    currency: 'btc',
    amount: '0.00260000',
    fiatCurrency: 'kes',
    fiatAmount: '130000.00',
    custodianRef: 'TRADE-1',
    note: 'test',
  };

  it('normalizes currencies and amounts to their own scales', () => {
    const { svc } = service({});
    const trade = svc.validateRebalance(input);
    expect(trade).toMatchObject({
      side: 'BUY',
      currency: 'BTC',
      amount: '0.00260000',
      fiatCurrency: 'KES',
      fiatAmount: '130000.00',
    });
  });

  it('refuses a side other than BUY/SELL', () => {
    const { svc } = service({});
    expect(() => svc.validateRebalance({ ...input, side: 'HOLD' })).toThrow(PlatformException);
  });

  it('refuses a non-custodial crypto currency', () => {
    const { svc } = service({});
    expect(() => svc.validateRebalance({ ...input, currency: 'USD' })).toThrow(PlatformException);
  });

  it('refuses a crypto fiat leg and a non-positive amount', () => {
    const { svc } = service({});
    expect(() => svc.validateRebalance({ ...input, fiatCurrency: 'BTC' })).toThrow(PlatformException);
    expect(() => svc.validateRebalance({ ...input, amount: '0' })).toThrow(PlatformException);
    expect(() => svc.validateRebalance({ ...input, amount: '-1' })).toThrow(PlatformException);
  });
});

describe('ExposureService.overview recon', () => {
  const statement = (overrides: Partial<CustodianStatement>): CustodianStatement => ({
    id: 'stmt_1',
    custodianId: 'crypto-btc',
    currency: 'BTC',
    balance: '0.01000000',
    asOf: new Date('2026-11-26T09:00:00Z'),
    statementRef: 'DAMP-CRYPTO-BTC-001/2026-11-26',
    source: 'stub',
    postedAt: null,
    postAttempts: 0,
    lastError: '',
    ...overrides,
  });

  it('reports MATCH when the custodian agrees with the ledger within tolerance', async () => {
    // Ledger custody 0.01, custodian reports 0.01000001 (1 sat over): with
    // tolerance 0.00000002 the difference is within tolerance.
    const { svc } = service({
      positions: [position({ custody_holdings: '0.01000000', customer_liabilities: '0.01000000', fx_position: '0', net_exposure: '0' })],
      statements: [statement({ balance: '0.01000001' })],
      tolerance: '0.00000002',
    });
    const [row] = await svc.overview();
    expect(row.recon).toMatchObject({ status: 'MATCH', custodianReported: '0.01000001' });
  });

  it('reports DRIFT when the custodian disagrees by more than the tolerance', async () => {
    // Zero tolerance (the default): any difference is a break. The
    // custodian claims 0.005 — the "crypto went missing" demo.
    const { svc } = service({
      positions: [position({ custody_holdings: '0.01000000', customer_liabilities: '0.01000000', fx_position: '0', net_exposure: '0' })],
      statements: [statement({ balance: '0.00500000' })],
    });
    const [row] = await svc.overview();
    expect(row.recon).toMatchObject({
      status: 'DRIFT',
      custodianReported: '0.00500000',
      ledgerHoldings: '0.01000000',
      diff: '-0.00500000',
    });
  });

  it('leaves recon null until a custodian has reported anything', async () => {
    const { svc } = service({
      positions: [position({})],
      statements: [],
    });
    const [row] = await svc.overview();
    expect(row.recon).toBeNull();
    expect(row.custodianSnapshot).toBeNull();
  });

  it('sums the latest statement of every active custodian of a currency', async () => {
    const { svc } = service({
      positions: [position({ custody_holdings: '0.01000000', customer_liabilities: '0.01000000', fx_position: '0', net_exposure: '0' })],
      statements: [
        statement({ id: 'stmt_a', custodianId: 'crypto-btc', balance: '0.00600000', asOf: new Date('2026-11-26T09:00:00Z') }),
        statement({ id: 'stmt_b', custodianId: 'crypto-btc-2', balance: '0.00400000', asOf: new Date('2026-11-26T08:00:00Z') }),
      ],
    });
    const [row] = await svc.overview();
    expect(row.recon?.custodianReported).toBe('0.01000000');
    expect(row.custodianSnapshot?.custodianIds).toEqual(['crypto-btc', 'crypto-btc-2']);
  });

  it('computes utilisation against the applicable limit side', async () => {
    const { svc } = service({
      positions: [position({ net_exposure: '-2.50000000' })],
      limits: { maxShort: '5', maxLong: '5' },
    });
    const [row] = await svc.overview();
    // 2.5 of a 5 BTC short mandate = 50% = 5000bps.
    expect(row.utilisationBps).toBe(5000);
  });
});
