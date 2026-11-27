import { describe, expect, it } from 'vitest';
import { addDecimal, divDecimal, isNegative, mulDecimal, parseAmountInput } from './money';

describe('parseAmountInput', () => {
  it('accepts plain decimals and strips thousands separators', () => {
    expect(parseAmountInput('1,250.50')).toEqual({ ok: true, value: '1250.50' });
    expect(parseAmountInput(' 7 ')).toEqual({ ok: true, value: '7' });
  });

  it('refuses what would need float parsing to make sense of', () => {
    expect(parseAmountInput('')).toMatchObject({ ok: false });
    expect(parseAmountInput('1e3')).toMatchObject({ ok: false });
    expect(parseAmountInput('-5')).toMatchObject({ ok: false });
    expect(parseAmountInput('1.2.3')).toMatchObject({ ok: false });
  });

  it('enforces the currency’s decimal places and a non-zero amount', () => {
    expect(parseAmountInput('1.234', 2)).toEqual({ ok: false, error: 'At most 2 decimal places.' });
    expect(parseAmountInput('1.234567', 6)).toEqual({ ok: true, value: '1.234567' });
    expect(parseAmountInput('0.00')).toEqual({ ok: false, error: 'The amount must be more than zero.' });
  });
});

describe('isNegative', () => {
  it('reads the sign from the decimal string, never a float', () => {
    expect(isNegative({ amount: '-0.01', currency: 'USD', decimals: 2, display: '-$0.01' })).toBe(true);
    expect(isNegative({ amount: '0.01', currency: 'USD', decimals: 2, display: '$0.01' })).toBe(false);
  });
});

describe('decimal-string arithmetic', () => {
  it('adds exactly where floats drift (0.1 + 0.2)', () => {
    expect(addDecimal('0.1', '0.2')).toBe('0.3');
    expect(addDecimal('1.5', '-0.5')).toBe('1');
    expect(addDecimal('0.001', '2')).toBe('2.001');
    expect(addDecimal('-2.5', '-3.5')).toBe('-6');
    expect(addDecimal('1000000.123456', '0.000001')).toBe('1000000.123457');
  });

  it('multiplies exactly and drops trailing zeros', () => {
    expect(mulDecimal('1.005', '1.005')).toBe('1.010025');
    expect(mulDecimal('0.5', '60000')).toBe('30000');
    expect(mulDecimal('0.1', '0.1')).toBe('0.01');
    expect(mulDecimal('2', '0.5')).toBe('1');
    expect(mulDecimal('-2', '0.5')).toBe('-1');
    expect(mulDecimal('0', '123.45')).toBe('0');
    expect(mulDecimal('0.12345678', '97345.671234')).toBe('12017.98311748826652');
  });

  it('divides rounded half-up at the requested scale', () => {
    expect(divDecimal('1', '8', 2)).toBe('0.13');
    expect(divDecimal('1', '3', 2)).toBe('0.33');
    expect(divDecimal('2', '3', 2)).toBe('0.67');
    expect(divDecimal('100', '0.5', 2)).toBe('200.00');
    expect(divDecimal('1', '2', 2)).toBe('0.50');
    expect(divDecimal('-1', '2', 2)).toBe('-0.50');
    expect(divDecimal('0', '7', 4)).toBe('0.0000');
    expect(() => divDecimal('1', '0', 2)).toThrow('division by zero');
  });

  it('computes a percent change without ever going through floats', () => {
    // (last − first) / first × 100 at 2dp: 105.6789 over 100 → 5.68
    const change = divDecimal(mulDecimal(addDecimal('105.6789', '-100'), '100'), '100', 2);
    expect(change).toBe('5.68');
  });
});
