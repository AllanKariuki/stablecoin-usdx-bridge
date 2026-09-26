/**
 * Money mirrors services/bff/src/money/money.ts's wire shape exactly —
 * `amount` is core-ledger's already-scaled decimal string, `display` is
 * already formatted server-side. This module never parses `amount` back
 * into a number; `display` is the only thing safe to render, and the
 * no-numeric-money-coercion ESLint rule (eslint.config.js) enforces that
 * for these three field names project-wide.
 */
export interface Money {
  amount: string;
  currency: string;
  decimals: number;
  display: string;
}

export function isNegative(money: Money): boolean {
  return money.amount.startsWith('-');
}
