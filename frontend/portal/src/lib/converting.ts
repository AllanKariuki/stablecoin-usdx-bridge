/**
 * Shared bits for the CONVERTING settlement story — the copy and polling
 * cadence the ConvertingTracker and the Send wizard's result step both use.
 * Kept out of the component file so it only exports a component (react-refresh).
 */

/** Sepolia finality is ~15 minutes; the intent only changes when the
 * conversion poller lands a state, so faster buys nothing. */
export const INTENT_POLL_MS = 5000;

/** Friendly copy for the failure reasons a USD-X settlement can end on —
 * the raw strings are written for operators, not customers. */
export function intentFailureCopy(reason: string): string {
  const code = reason.split(':')[0].trim();
  if (code === 'QUOTE_EXPIRED_DURING_CONVERSION') {
    return 'The rate expired while your USD-X burn confirmed. Your USD-X was redeemed to dollars in your USD wallet — nothing was lost. Try the payment again with a fresh quote.';
  }
  return reason;
}
