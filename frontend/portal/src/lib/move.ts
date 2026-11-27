import { Smartphone, Landmark, type LucideIcon } from 'lucide-react';

/**
 * Shared bits for the deposit / withdraw wizards. Kept out of the page files
 * so each exports only a component (react-refresh), mirroring lib/converting.
 */

/** The deposit/withdraw status step polls faster than a chain burn: the rail
 * usually answers in seconds (M-Pesa STK/B2C), and 3s keeps the screen
 * current without hammering the gateway. */
export const MOVE_POLL_MS = 3000;

/** Statuses that end a move. Everything else keeps polling. */
export const MOVE_TERMINAL = new Set(['SETTLED', 'FAILED', 'CANCELLED']);

/** A fiat on-ramp / off-ramp offered on the move pages. Card, crypto and cash
 * are deliberately not offered — this screen moves money to/from a bank or
 * mobile money provider only. */
export interface MoveMethod {
  value: 'mpesa' | 'bank';
  label: string;
  description: string;
  currencies: string[];
  icon: LucideIcon;
}

export const DEPOSIT_METHODS: MoveMethod[] = [
  {
    value: 'mpesa',
    label: 'M-Pesa',
    description: 'Approve a prompt on your phone to pay into your wallet.',
    currencies: ['KES'],
    icon: Smartphone,
  },
  {
    value: 'bank',
    label: 'Bank transfer',
    description: 'Pull from a verified bank account you’ve already linked.',
    currencies: ['USD', 'EUR', 'KES'],
    icon: Landmark,
  },
];

/** Withdrawal to M-Pesa only pays out Kenyan shillings (the B2C rail moves
 * whole shillings), so the method is only usable from a KES wallet. */
export const WITHDRAW_METHODS: MoveMethod[] = DEPOSIT_METHODS;

/** Friendly copy for the failure reasons a move can end on. The raw strings
 * are Daraja/rail-speak written for operators; customers get the human
 * version. Anything we don't recognise is passed through as-is. */
export function moveFailureCopy(reason: string): string {
  const r = reason.trim();
  // Daraja STK Push result codes (ResultDesc is free text, so match the code).
  if (r.includes('1032')) return 'You cancelled the request on your phone. Nothing was moved.';
  if (r.includes('1037')) return 'The M-Pesa prompt timed out. Start again and approve it promptly.';
  if (r.includes('2001')) return 'Your M-Pesa balance is too low for this amount.';
  if (r.includes('1031')) return 'The request expired before it could be approved. Try again.';
  if (/stub rail/i.test(r)) return 'Your provider declined the transfer. Nothing was moved.';
  return r;
}
