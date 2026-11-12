import { isNegative, type Money } from '@damp/web-shared/api';

/**
 * core-ledger statement and journal amounts are unsigned with a separate
 * DEBIT/CREDIT direction. A customer wallet is a liability account, so a
 * DEBIT is money leaving it. Sign is shown with a +/− and an arrow as well
 * as colour, never colour alone.
 */
export function isOutgoing(money: Money, direction: string) {
  return isNegative(money) || direction.toUpperCase() === 'DEBIT';
}
