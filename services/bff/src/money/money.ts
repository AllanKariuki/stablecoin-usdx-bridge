/**
 * Money is the one shape every amount in every bff response takes — see
 * docs/building-plan.md's P1 decision: "Money never becomes a float,
 * anywhere. The BFF emits {amount: '1234.56', currency: 'USD', decimals: 2,
 * display: '$1,234.56'}." `amount` is always a decimal string (core-ledger
 * already renders it that way via internal/ledger.FormatDecimal — this
 * module never parses it back into a number, only wraps it).
 */
export interface Money {
  amount: string;
  currency: string;
  decimals: number;
  display: string;
}

/**
 * CURRENCY_DECIMALS mirrors core-ledger's DefaultCurrencies
 * (core-ledger/internal/ledger/chart.go), which bff now also reads live
 * through GET /currencies (see WalletsService.listCurrencies). The static
 * map stays because toMoney runs on every wallet render — a fetch per
 * render would be wrong, and a cache would be a second source of truth.
 * It must cover every currency core-ledger seeds, and adding one there
 * without adding it here is a render bug, not a new feature.
 */
const CURRENCY_DECIMALS: Record<string, number> = {
  USD: 2,
  EUR: 2,
  GBP: 2,
  KES: 2,
  BTC: 8,
  ETH: 18,
  SOL: 9,
  USDX: 6,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  KES: 'KSh ',
  BTC: '₿',
  ETH: 'Ξ',
  SOL: '◎',
  USDX: '',
};

function decimalsFor(currency: string): number {
  return CURRENCY_DECIMALS[currency] ?? 2;
}

/**
 * toMoney wraps a core-ledger decimal-string amount (already correctly
 * scaled — see FormatDecimal on the Go side) into the Money envelope. It
 * never does arithmetic on `amount`, only formats a display string from it
 * — the one thing this module is trusted to compute, everything else stays
 * a pass-through string.
 */
export function toMoney(amount: string, currency: string): Money {
  const decimals = decimalsFor(currency);
  return {
    amount,
    currency,
    decimals,
    display: formatDisplay(amount, currency),
  };
}

function formatDisplay(amount: string, currency: string): string {
  const negative = amount.startsWith('-');
  const unsigned = negative ? amount.slice(1) : amount;
  const [whole, frac = ''] = unsigned.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decimals = decimalsFor(currency);
  const paddedFrac = frac.padEnd(decimals, '0').slice(0, decimals || undefined);
  const symbol = CURRENCY_SYMBOLS[currency] ?? `${currency} `;
  const numberPart = decimals > 0 ? `${grouped}.${paddedFrac}` : grouped;
  return `${negative ? '-' : ''}${symbol}${numberPart}`;
}
