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
 * Decimal-string arithmetic on BigInts — the browser never parses money
 * into floats. `money.amount` is core-ledger's already-scaled decimal
 * string; these helpers move the point themselves.
 */
const decimalPart = (value: string): [bigint, number] => {
  const [int = '', frac = ''] = value.trim().replace('-', '').split('.');
  const digits = `${int}${frac}`.replace(/^0+(?=\d)/, '');
  return [BigInt(digits || '0'), frac.length];
};

const isNegativeDecimal = (value: string) => value.trim().startsWith('-');

/** Re-inserts the point at `scale` and drops trailing zeros ('1.50' → '1.5'). */
const joinDecimal = (sign: string, whole: bigint, scale: number) => {
  if (!scale) return `${sign}${whole}`;
  const digits = String(whole).padStart(scale + 1, '0');
  const withPoint = `${digits.slice(0, -scale) || '0'}.${digits.slice(-scale)}`;
  return `${sign}${withPoint.replace(/(?:\.0*|(\.\d*?)0+)$/, '$1')}`;
};

/** Exact decimal addition, e.g. addDecimal('0.1', '0.2') === '0.3'. */
export function addDecimal(a: string, b: string): string {
  const [ai, af] = decimalPart(a);
  const [bi, bf] = decimalPart(b);
  const scale = Math.max(af, bf);
  const sum = (isNegativeDecimal(a) ? -1n : 1n) * ai * 10n ** BigInt(scale - af) + (isNegativeDecimal(b) ? -1n : 1n) * bi * 10n ** BigInt(scale - bf);
  return joinDecimal(sum < 0n ? '-' : '', sum < 0n ? -sum : sum, scale);
}

/** Exact decimal multiplication, e.g. mulDecimal('1.005', '1.005') === '1.010025'. */
export function mulDecimal(a: string, b: string): string {
  const [ai, af] = decimalPart(a);
  const [bi, bf] = decimalPart(b);
  const product = (isNegativeDecimal(a) ? -1n : 1n) * (isNegativeDecimal(b) ? -1n : 1n) * ai * bi;
  return joinDecimal(product < 0n ? '-' : '', product < 0n ? -product : product, af + bf);
}

/**
 * Decimal division rounded half-up to `scale` fraction digits, e.g.
 * divDecimal('1', '8', 2) === '0.13'. `b` must not be zero.
 */
export function divDecimal(a: string, b: string, scale = 12): string {
  const [ai, af] = decimalPart(a);
  const [bi, bf] = decimalPart(b);
  if (bi === 0n) throw new Error('division by zero');
  const negative = isNegativeDecimal(a) !== isNegativeDecimal(b);
  // (ai · 10^bf · 10^scale) / (bi · 10^af): both sides carry the same
  // power-of-ten adjustment, so the result is a/b at `scale` digits.
  let numerator = ai * 10n ** BigInt(bf) * 10n ** BigInt(scale);
  let denominator = bi * 10n ** BigInt(af);
  const strip = (n: bigint): [bigint, bigint] => {
    let t = n;
    let c = 0n;
    while (t !== 0n && t % 10n === 0n) {
      t /= 10n;
      c += 1n;
    }
    return [t, c];
  };
  const [nt, nc] = strip(numerator);
  const [dt, dc] = strip(denominator);
  const common = nc < dc ? nc : dc;
  numerator = nt * 10n ** (nc - common);
  denominator = dt * 10n ** (dc - common);
  const quotient = numerator / denominator;
  const rounded = (numerator % denominator) * 2n >= denominator ? quotient + 1n : quotient;
  const digits = String(rounded).padStart(scale + 1, '0');
  return `${negative ? '-' : ''}${digits.slice(0, -scale) || '0'}.${digits.slice(-scale)}`;
}

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
