import type { SymbolStatus } from '@damp/web-shared/api/pricing';
import type { Wallet } from '@damp/web-shared/api';
import { addDecimal, divDecimal, mulDecimal } from '@damp/web-shared/api';

/**
 * USD valuation of wallets and change badges. Every value is an exact
 * decimal string — BigInts in @damp/web-shared/api/money, never floats.
 * Formatting may convert to a Number for rendering, arithmetic never does.
 */

/** USD and USD-X are the peg itself: 1 = $1. */
export const isUsdPeg = (currency: string) => currency === 'USD' || currency === 'USDX';

export type RateMap = Map<string, SymbolStatus | undefined>;

export const boardRates = (board: { entries: SymbolStatus[] } | undefined): RateMap =>
  new Map((board?.entries ?? []).map((e) => [e.currency, e]));

/** A wallet's balance in USD, or null when the rate is unavailable. */
export function walletUsdValue(wallet: Wallet, rates: RateMap): string | null {
  if (isUsdPeg(wallet.currency)) return wallet.balance.amount;
  const entry = rates.get(wallet.currency);
  if (!entry?.rate) return null;
  return mulDecimal(wallet.balance.amount, entry.rate);
}

export interface PortfolioTotal {
  /** Sum of every wallet's USD value; null while nothing can be valued. */
  total: string | null;
  /** A wallet was left out because its rate is unavailable. */
  missingSome: boolean;
}

export function portfolioTotal(wallets: Wallet[], rates: RateMap): PortfolioTotal {
  let total: string | null = null;
  let missingSome = false;
  for (const wallet of wallets) {
    const value = walletUsdValue(wallet, rates);
    if (value === null) {
      missingSome = true;
      continue;
    }
    total = total === null ? value : addDecimal(total, value);
  }
  return { total, missingSome };
}

/** '30260.512345' → '$30,260.51' (rounds half-up to cents, groups thousands). */
export function formatUsd(value: string): string {
  const rounded = divDecimal(value, '1', 2);
  const negative = rounded.startsWith('-');
  const [int, frac = ''] = rounded.replace('-', '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '−' : ''}$${grouped}.${frac.padEnd(2, '0')}`;
}

/** (price − first) / first × 100 at `scale` fraction digits, exact. */
export function pctChange(first: string, price: string, scale = 4): string {
  return divDecimal(mulDecimal(addDecimal(price, `-${first}`), '100'), first, scale);
}

/** '3.4212' → '3.42%', '-0.06' → '−0.06%' — for the board's change_24h_pct. */
export function formatPct(value: string): string {
  const negative = value.startsWith('-');
  const abs = negative ? value.slice(1) : value;
  const [int, frac = ''] = abs.split('.');
  const digits = `${int}.${frac.slice(0, 2).padEnd(2, '0')}`.replace(/\.00$/, '');
  return `${negative ? '−' : '+'}${digits}%`;
}

/** The board's 24h change for a currency, or null (crypto legs only carry it). */
export const change24hFor = (currency: string, rates: RateMap): string | null => rates.get(currency)?.change_24h_pct ?? null;
