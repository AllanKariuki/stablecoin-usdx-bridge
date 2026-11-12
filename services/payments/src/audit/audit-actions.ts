/**
 * Audit actions payments emits. Where money goes (a bank account, a
 * beneficiary), who asked for it to move (an intent), and what decided it
 * moved or did not (a rail's callback, a settlement refused for a wrong
 * amount) are the evidence a regulator asks for first. Each is written to
 * audit_outbox in the same transaction as the change and relayed to
 * services/audit-trail.
 */
export const AUDIT = {
  intentCreated: 'payments.intent.created',
  intentCancelled: 'payments.intent.cancelled',
  intentSettled: 'payments.intent.settled',
  intentFailed: 'payments.intent.failed',
  /** A rail reported a different amount than the intent asked for; nothing was booked. */
  settlementRefused: 'payments.intent.settlement_refused',
  bankAccountRegistered: 'payments.bank_account.registered',
  bankAccountVerified: 'payments.bank_account.verified',
  bankAccountRemoved: 'payments.bank_account.removed',
  beneficiaryAdded: 'payments.beneficiary.added',
  invoiceIssued: 'payments.invoice.issued',
  invoiceVoided: 'payments.invoice.voided',
} as const;

export const SERVICE = 'payments';

/**
 * A settlement or failure reported by a rail has no human behind it; the rail
 * is the actor. An internal transfer settles on the customer's own request,
 * so its actor is the party.
 */
export function railActor(rail: string): string {
  return `rail:${rail}`;
}
