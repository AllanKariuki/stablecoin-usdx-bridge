/**
 * rms's copy of the platform's Money shape, plus the one piece of
 * arithmetic it genuinely needs.
 *
 * The shape is duplicated from services/bff/src/money/money.ts rather than
 * shared, for the same reason it was duplicated into identity: it is a
 * wire contract, and a shared package would make a bff display change a
 * breaking change for a treasury service that only ever adds two numbers.
 *
 * What is *not* duplicated is the discipline: amounts are decimal strings,
 * arithmetic happens on scaled integers (BigInt, never Number), and no
 * value in this file is ever coerced with parseFloat. A custodian balance
 * off by a rounding error is a reconciliation break somebody spends a day
 * chasing.
 */
export interface Money {
  amount: string;
  currency: string;
  decimals: number;
  display: string;
}

const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  KES: 2,
  USDX: 6,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  KES: 'KSh ',
  USDX: '',
};

export function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

export function toMoney(amount: string, currency: string): Money {
  return {
    amount: normalize(amount, decimalsFor(currency)),
    currency,
    decimals: decimalsFor(currency),
    display: formatDisplay(amount, currency),
  };
}

/**
 * addDecimal adds a signed decimal string to a Money, exactly.
 *
 * Both operands are scaled to integers first and added as BigInt. The
 * obvious alternative — parseFloat(a) + parseFloat(b) — is wrong in a way
 * that only shows up in production: 0.1 + 0.2 is not 0.3 in binary
 * floating point, and a custodian balance that is off by 1e-17 makes Leg C
 * report a shortfall of one hundredth of a cent, forever.
 */
export function addDecimal(base: Money, delta: string): Money {
  const decimals = base.decimals;
  const sum = toScaled(base.amount, decimals) + toScaled(delta, decimals);
  return toMoney(fromScaled(sum, decimals), base.currency);
}

/** Compares two same-currency decimal strings. Returns -1, 0 or 1. */
export function compareDecimal(a: string, b: string, decimals: number): number {
  const left = toScaled(a, decimals);
  const right = toScaled(b, decimals);
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** toScaled turns "1234.56" at 2 decimals into 123456n. */
export function toScaled(amount: string, decimals: number): bigint {
  const trimmed = amount.trim();
  if (trimmed === '') return 0n;

  const negative = trimmed.startsWith('-');
  const unsigned = negative ? trimmed.slice(1) : trimmed;
  const [whole = '0', frac = ''] = unsigned.split('.');

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

function normalize(amount: string, decimals: number): string {
  return fromScaled(toScaled(amount, decimals), decimals);
}

function formatDisplay(amount: string, currency: string): string {
  const decimals = decimalsFor(currency);
  const normalized = normalize(amount, decimals);
  const negative = normalized.startsWith('-');
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole, frac = ''] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const numberPart = decimals > 0 ? `${grouped}.${frac.padEnd(decimals, '0')}` : grouped;
  return `${negative ? '-' : ''}${symbol}${numberPart}`;
}
