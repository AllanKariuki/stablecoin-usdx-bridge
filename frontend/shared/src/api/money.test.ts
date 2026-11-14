import { describe, expect, it } from 'vitest';
import { isNegative, parseAmountInput } from './money';

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
