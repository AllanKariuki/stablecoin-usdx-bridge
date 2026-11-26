/**
 * pricing's fixed-point arithmetic — the Node twin of the numbers in
 * core-ledger/internal/ledger/fx.go, and the only place this service does
 * math on rates or amounts.
 *
 * The discipline is copied from services/rms/src/money/money.ts: values are
 * decimal strings, arithmetic happens on scaled BigInts (never Number), and
 * nothing in this file is ever coerced with parseFloat. A rate off by 1e-17
 * is a quote off by a fraction of a cent on every conversion that consumes
 * it, forever. Division truncates toward zero, which for the positive rates
 * this service produces means rounding *down* — toward the house, whose FX
 * position keeps the residue, exactly like core-ledger's Convert().
 */

/** The scale a rate is fixed at — core-ledger's ledger.FxRateScale. */
export const RATE_SCALE = 18;

/** Currency decimals, matching core-ledger's chart (internal/ledger/chart.go). */
export const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KES: 2,
  BTC: 8,
  ETH: 18,
  SOL: 9,
  USDX: 6,
};

/**
 * The currencies a quote may ever involve. USD-X is deliberately absent:
 * it is issued 1:1 against USD and never priced — core-ledger rejects any
 * USD-X pair with USDX_USES_ISSUANCE, and pricing must refuse before the
 * call is even made.
 */
export const QUOTABLE_CURRENCIES = ['USD', 'EUR', 'GBP', 'KES', 'BTC', 'ETH', 'SOL'] as const;

export function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

export function isQuotable(currency: string): boolean {
  return (QUOTABLE_CURRENCIES as readonly string[]).includes(currency);
}

/** parseRate reads a decimal string ("130.25") into fixed point at RATE_SCALE. */
export function parseRate(s: string): bigint {
  const trimmed = s.trim();
  if (trimmed === '' || trimmed.startsWith('-')) {
    throw new Error(`"${s}" is not a rate`);
  }
  return toScaled(trimmed, RATE_SCALE);
}

/**
 * formatRate is parseRate's inverse, for the wire and the DB. The ledger
 * renders rates at the full 18 decimals (FormatRate); this service trims
 * trailing zeros to the same value in a readable shape — ParseRate on
 * either side accepts both, and the scale information lives in the
 * fixed-point value, not in the string.
 */
export function formatRate(r: bigint): string {
  const rendered = fromScaled(r, RATE_SCALE);
  return rendered.includes('.') ? rendered.replace(/\.?0+$/, '') : rendered;
}

/**
 * mulRate multiplies two fixed-point rates: (a * b) / 10^RATE_SCALE,
 * truncating toward zero. Multiplying before dividing keeps the product
 * exact — truncating an intermediate would quietly move every later digit.
 */
export function mulRate(a: bigint, b: bigint): bigint {
  return (a * b) / 10n ** BigInt(RATE_SCALE);
}

/**
 * inverseRate is 1/r at RATE_SCALE: 10^36 / r, truncated toward zero. For
 * a positive rate that rounds down — KES/BTC is the reciprocal of BTC/KES,
 * and the house keeping the fractional satoshi is the direction that can
 * never invent value for the buyer.
 */
export function inverseRate(r: bigint): bigint {
  if (r <= 0n) throw new Error(`cannot invert rate ${r}`);
  return 10n ** BigInt(RATE_SCALE * 2) / r;
}

/** toScaled turns "1234.56" at 2 decimals into 123456n. The shape rules
 * mirror core-ledger's ParseDecimal: a leading "+" is allowed, a trailing
 * decimal point or a second point is rejected — "1.5.0" is a client bug,
 * and silently reading it as 1.5 hides it. */
export function toScaled(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (trimmed === '') throw new Error(`"" is not a decimal amount`);

  const negative = trimmed.startsWith('-');
  const unsigned = (negative ? trimmed.slice(1) : trimmed).replace(/^\+/, '');
  if (unsigned === '') throw new Error(`"${amount}" is not a decimal amount`);

  const parts = unsigned.split('.');
  if (parts.length > 2) throw new Error(`"${amount}" is not a decimal amount`);
  const [whole = '0', frac = ''] = parts;
  if (parts.length === 2 && frac === '') throw new Error(`"${amount}" is not a decimal amount`);

  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) {
    throw new Error(`"${amount}" is not a decimal amount`);
  }
  if (frac.length > decimals) {
    throw new Error(`"${amount}" has more than ${decimals} decimal places`);
  }

  const scaled = BigInt(whole + frac.padEnd(decimals, '0'));
  return negative ? -scaled : scaled;
}

/** fromScaled is toScaled's inverse: 123456n at 2 decimals is "1234.56". */
export function fromScaled(scaled: bigint, decimals: number): string {
  const negative = scaled < 0n;
  const digits = (negative ? -scaled : scaled).toString().padStart(decimals + 1, '0');
  if (decimals === 0) return `${negative ? '-' : ''}${digits}`;
  return `${negative ? '-' : ''}${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

/**
 * deviationBps is the disagreement between two fixed-point mids, in basis
 * points of the smaller one: |a-b| / min(a,b) * 10000, truncated. The
 * breaker's question is "how far apart are these two sources, relative to
 * the price", and the smaller one is the conservative denominator.
 */
export function deviationBps(a: bigint, b: bigint): bigint {
  const diff = a > b ? a - b : b - a;
  const base = a < b ? a : b;
  if (base === 0n) return 0n;
  return (diff * 10000n) / base;
}

/** Conversion is the result of applying a quote, in smallest units. */
export interface Conversion {
  gross: bigint;
  fee: bigint;
  net: bigint;
}

/**
 * convertAmount is core-ledger's Convert() verbatim, in BigInt:
 *
 *   gross = amount * rate * 10^toDecimals / (10^RATE_SCALE * 10^fromDecimals)
 *   fee   = gross * spreadBps / 10000
 *   net   = gross - fee
 *
 * evaluated as one fraction so the intermediate never rounds, then
 * truncated once toward zero. `amount` is in `from`'s smallest units; the
 * result is in `to`'s smallest units. Unit tests assert parity with
 * core-ledger/internal/ledger/fx_test.go's cases, so the numbers a caller
 * sees here are exactly the numbers the ledger will book.
 */
export function convertAmount(
  amount: bigint,
  rate: bigint,
  fromDecimals: number,
  toDecimals: number,
  spreadBps: number,
): Conversion {
  const numerator = amount * rate * 10n ** BigInt(toDecimals);
  const denominator = 10n ** BigInt(RATE_SCALE) * 10n ** BigInt(fromDecimals);
  const gross = numerator / denominator;
  // A non-positive spread is no spread — the same guard as ApplyBps.
  const fee = spreadBps > 0 ? (gross * BigInt(spreadBps)) / 10000n : 0n;
  return { gross, fee, net: gross - fee };
}
