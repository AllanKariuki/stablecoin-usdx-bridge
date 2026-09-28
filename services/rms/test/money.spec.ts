import { addDecimal, compareDecimal, fromScaled, toMoney, toScaled } from '../src/money/money';

/**
 * These are not tests of a formatting helper. They are tests of the one
 * place rms does arithmetic on money, and every case below is a number that
 * IEEE-754 gets wrong.
 */
describe('decimal arithmetic', () => {
  it('adds a drift without floating-point error', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in binary floating point. A custodian
    // balance off by 4e-17 makes Leg C report a shortfall of a fraction of a
    // cent, on every run, forever.
    const base = toMoney('0.10', 'USD');
    expect(addDecimal(base, '0.20').amount).toBe('0.30');
  });

  it('subtracts the DoD drift exactly', () => {
    const base = toMoney('100000.00', 'USD');
    const short = addDecimal(base, '-1000.00');
    expect(short.amount).toBe('99000.00');
    expect(short.display).toBe('$99,000.00');
  });

  it('holds a balance larger than Number.MAX_SAFE_INTEGER', () => {
    // USD-X is 6dp, so 10 billion tokens is 1e16 base units — past 2^53,
    // where a Number silently rounds. This is why every amount that crosses
    // a boundary in this platform is a string.
    const big = toMoney('10000000000.000000', 'USDX');
    expect(addDecimal(big, '0.000001').amount).toBe('10000000000.000001');
  });

  it('rejects an amount with more precision than its currency has', () => {
    // Accepting it would mean silently rounding a figure a custodian
    // reported, which is exactly the class of quiet error reconciliation
    // exists to catch.
    expect(() => toScaled('1.005', 2)).toThrow(/decimal places/);
  });

  it('round-trips through scaled integers', () => {
    for (const amount of ['0.00', '-0.01', '1234.56', '-1000.00', '999999999.99']) {
      expect(fromScaled(toScaled(amount, 2), 2)).toBe(amount);
    }
  });

  it('compares negatives the way a shortfall needs', () => {
    expect(compareDecimal('99000.00', '100000.00', 2)).toBe(-1);
    expect(compareDecimal('100000.00', '100000.00', 2)).toBe(0);
    expect(compareDecimal('100000.01', '100000.00', 2)).toBe(1);
  });
});
