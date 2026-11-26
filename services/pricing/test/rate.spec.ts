import {
  convertAmount,
  deviationBps,
  formatRate,
  fromScaled,
  inverseRate,
  minimalFromAmount,
  mulRate,
  parseRate,
  RATE_SCALE,
  toScaled,
} from '../src/money/rate';

/**
 * Fixed-point arithmetic, including parity with core-ledger's
 * internal/ledger/fx_test.go cases: the numbers a caller sees here must be
 * the exact numbers the ledger books, so every Convert() case the ledger
 * tests is re-asserted against convertAmount.
 */

describe('parseRate / formatRate', () => {
  it('round-trips decimal strings at 18 decimals', () => {
    for (const s of ['130.25', '0.000012345678901234', '129.5', '3500', '100000']) {
      expect(formatRate(parseRate(s))).toBe(s);
    }
  });

  it('rejects garbage', () => {
    expect(() => parseRate('')).toThrow();
    expect(() => parseRate('-1.5')).toThrow();
    expect(() => parseRate('1.5.0')).toThrow();
  });
});

describe('mulRate', () => {
  it('multiplies at full precision and divides once', () => {
    expect(formatRate(mulRate(parseRate('100000'), parseRate('129.5')))).toBe('12950000');
    expect(formatRate(mulRate(parseRate('0.5'), parseRate('0.25')))).toBe('0.125');
  });
});

describe('inverseRate', () => {
  it('inverts with the division truncating down, toward the house', () => {
    // 1/129.5 at 18 decimals, floored: the buyer of the inverted leg gets
    // slightly less, never more.
    expect(formatRate(inverseRate(parseRate('129.5')))).toBe('0.007722007722007722');
    expect(formatRate(inverseRate(parseRate('100000')))).toBe('0.00001');
  });

  it('multiplying an inverse back never exceeds 1', () => {
    const r = parseRate('129.5');
    const back = mulRate(inverseRate(r), r);
    expect(back).toBeLessThanOrEqual(10n ** BigInt(RATE_SCALE));
    // ...and the truncation loses less than one part in 10^15.
    expect(10n ** BigInt(RATE_SCALE) - back).toBeLessThan(1000n);
  });
});

describe('deviationBps', () => {
  it('measures disagreement in basis points of the smaller value', () => {
    expect(deviationBps(parseRate('100'), parseRate('100.15'))).toBe(15n);
    expect(deviationBps(parseRate('101600'), parseRate('100000'))).toBe(160n);
    expect(deviationBps(parseRate('100'), parseRate('100'))).toBe(0n);
  });
});

describe('toScaled / fromScaled', () => {
  it('round-trips each currency scale (ledger fx_test parity)', () => {
    expect(toScaled('10.00', 2)).toBe(1000n);
    expect(toScaled('10', 2)).toBe(1000n);
    expect(toScaled('10.00', 6)).toBe(10000000n);
    expect(toScaled('0.000001', 6)).toBe(1n);
    expect(toScaled('130000.00', 2)).toBe(13000000n);
    expect(fromScaled(1n, 6)).toBe('0.000001');
    expect(fromScaled(0n, 2)).toBe('0.00');
    expect(fromScaled(-1050n, 2)).toBe('-10.50');
  });

  it('rejects more precision than the currency has, rather than truncating', () => {
    expect(() => toScaled('10.001', 2)).toThrow('decimal places');
    expect(toScaled('10.001', 6)).toBe(10001000n);
  });
});

describe('convertAmount — core-ledger Convert() parity (fx_test.go)', () => {
  it('KES -> USD at 50 bps', () => {
    // 130,000.00 KES at 1 KES = 0.007692307692307692 USD.
    const conv = convertAmount(13000000n, parseRate('0.007692307692307692'), 2, 2, 50);
    expect(conv.gross).toBe(99999n);
    expect(conv.fee).toBe(499n);
    expect(conv.net).toBe(99500n);
    expect(conv.net + conv.fee).toBe(conv.gross);
  });

  it('multiplies before dividing — no truncated intermediates', () => {
    // 0.01 USD at 129.5 is 1.295 KES -> 129, truncated once at the end.
    const conv = convertAmount(1n, parseRate('129.5'), 2, 2, 0);
    expect(conv.gross).toBe(129n);
  });

  it('truncates toward zero so nothing is invented', () => {
    // 0.03 USD -> 3.90021 KES stays 390.
    const conv = convertAmount(3n, parseRate('130.007'), 2, 2, 0);
    expect(conv.gross).toBe(390n);
  });

  it('ETH -> USD across the widest scale change', () => {
    // 1 ETH at 3,500.00 USD, 25 bps.
    const conv = convertAmount(10n ** 18n, parseRate('3500'), 18, 2, 25);
    expect(conv.gross).toBe(350000n);
    expect(conv.fee).toBe(875n);
    expect(conv.net).toBe(349125n);
    expect(conv.net + conv.fee).toBe(conv.gross);
  });

  it('USD -> BTC at 8 decimals', () => {
    // 100.00 USD at 1 USD = 0.00001 BTC is exactly 100,000 satoshi.
    const conv = convertAmount(10000n, parseRate('0.00001'), 2, 8, 10);
    expect(conv.gross).toBe(100000n);
    expect(conv.fee).toBe(100n);
    expect(conv.net).toBe(99900n);
  });

  it('leaves a sub-satoshi residue in the FX position', () => {
    // 1 USD cent at 0.000012345678901234 BTC = 12.345... sat -> 12.
    const conv = convertAmount(1n, parseRate('0.000012345678901234'), 2, 8, 0);
    expect(conv.gross).toBe(12n);
  });

  it('treats a non-positive spread as no spread', () => {
    const conv = convertAmount(100n, parseRate('2'), 2, 2, -10);
    expect(conv.fee).toBe(0n);
    expect(conv.net).toBe(conv.gross);
  });
});

describe('minimalFromAmount — TO-side quoting', () => {
  /**
   * The invariants every case asserts: the solved amount nets at least the
   * target (the payee is never short), one unit less does not (so it is
   * minimal — convertAmount is monotone in the amount, the fee floor's
   * increment never exceeding the gross floor's), and the answer is positive.
   */
  function assertMinimal(args: {
    target: bigint;
    rate: string;
    fromDecimals: number;
    toDecimals: number;
    spreadBps: number;
    expect?: bigint;
  }): void {
    const rate = parseRate(args.rate);
    const found = minimalFromAmount(args.target, rate, args.fromDecimals, args.toDecimals, args.spreadBps);
    expect(found).toBeGreaterThan(0n);
    expect(convertAmount(found, rate, args.fromDecimals, args.toDecimals, args.spreadBps).net).toBeGreaterThanOrEqual(
      args.target,
    );
    expect(convertAmount(found - 1n, rate, args.fromDecimals, args.toDecimals, args.spreadBps).net).toBeLessThan(
      args.target,
    );
    if (args.expect !== undefined) expect(found).toBe(args.expect);
  }

  it('solves BTC 8dp against USD 2dp', () => {
    // 1 BTC = 100000 USD at 100 bps, target 990.00 USD. The gross truncation
    // makes a flat region: every satoshi from 999990 up nets the same 990.00,
    // so the minimum sits inside it, a full 10 sats below the exact bound.
    assertMinimal({ target: 99000n, rate: '100000', fromDecimals: 8, toDecimals: 2, spreadBps: 100, expect: 999990n });
  });

  it('solves KES 2dp against USD 2dp (the ledger fx_test rate)', () => {
    // 13000000.00 KES at 0.007692307692307692, 50 bps nets 995.00 USD. The
    // minimum that still nets 995.00 sits below the estimate inside the
    // gross truncation's flat region.
    assertMinimal({ target: 99500n, rate: '0.007692307692307692', fromDecimals: 2, toDecimals: 2, spreadBps: 50 });
  });

  it('solves ETH 18dp against USD 2dp', () => {
    // 1 ETH = 3500 USD at 25 bps, target the fx_test net of one whole ETH.
    assertMinimal({ target: 349125n, rate: '3500', fromDecimals: 18, toDecimals: 2, spreadBps: 25 });
  });

  it('solves USD 2dp against KES 2dp', () => {
    // 129.50 KES per USD at 100 bps, target 1000.00 KES net: 7.80 USD is the
    // smallest amount that covers it (7.79 nets 998.72).
    assertMinimal({ target: 100000n, rate: '129.5', fromDecimals: 2, toDecimals: 2, spreadBps: 100, expect: 780n });
  });

  it('solves across a tiny rate without inventing a fractional unit', () => {
    // 1 USD = 0.00001 BTC (100 satoshi) at 10 bps, target 1000 satoshi: the
    // solution must stay in satoshi and net at least the target.
    assertMinimal({ target: 1000n, rate: '0.00001', fromDecimals: 2, toDecimals: 8, spreadBps: 10 });
  });

  it('treats a non-positive spread as no spread when solving', () => {
    // 2 KES per USD, no fee: target 3.00 KES is met exactly by 1.50 USD.
    assertMinimal({ target: 300n, rate: '2', fromDecimals: 2, toDecimals: 2, spreadBps: 0, expect: 150n });
  });
});
