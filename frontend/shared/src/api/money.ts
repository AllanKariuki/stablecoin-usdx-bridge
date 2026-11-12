/**
 * Mirrors services/bff/src/money/money.ts exactly. `amount` is core-ledger's
 * already-scaled decimal string and is never parsed back into a number;
 * `display` is the only thing to render.
 */
export interface Money {
  amount: string;
  currency: string;
  decimals: number;
  display: string;
}

export const isNegative = (money: Money) => money.amount.startsWith('-');
export const isZero = (money: Money) => /^-?0*(\.0*)?$/.test(money.amount);

/**
 * Validates a user-typed amount as a positive decimal with at most
 * `decimals` places, returning it normalised as a string for the API — the
 * backend owns the arithmetic, the browser only checks the shape.
 */
export function parseAmountInput(raw: string, decimals = 2): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim().replace(/,/g, '');
  if (!value) return { ok: false, error: 'Enter an amount.' };
  if (!/^\d+(\.\d+)?$/.test(value)) return { ok: false, error: 'Use digits and one decimal point only.' };
  const [, frac = ''] = value.split('.');
  if (frac.length > decimals) return { ok: false, error: `At most ${decimals} decimal places.` };
  if (/^0*(\.0*)?$/.test(value)) return { ok: false, error: 'The amount must be more than zero.' };
  return { ok: true, value };
}
