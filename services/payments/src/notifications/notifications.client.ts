import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * payments' one outbound call to services/notifications.
 *
 * Every method here is best-effort and deliberately swallows its errors. A
 * notification that fails to send must never fail a settlement that has
 * already happened — the money moved, the journal says so, and the worst
 * outcome of a dropped notification is a customer who checks their balance
 * instead of reading an email.
 *
 * The durable path for anything that must not be lost is the ledger's own
 * transactional outbox, which notifications also consumes. This is the
 * immediate, best-effort path that makes the UI feel live.
 */
@Injectable()
export class NotificationsClient {
  private readonly logger = new Logger(NotificationsClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('NOTIFICATIONS_URL', { infer: true }) ?? '';
  }

  paymentSettled(input: {
    partyId: string;
    intentId: string;
    direction: string;
    amount: string;
    currency: string;
    ledgerTxId: string;
  }): Promise<void> {
    return this.emit('payment.settled', input.partyId, input);
  }

  paymentFailed(input: {
    partyId: string;
    intentId: string;
    direction: string;
    amount: string;
    currency: string;
    reason: string;
  }): Promise<void> {
    return this.emit('payment.failed', input.partyId, input);
  }

  invoiceIssued(input: {
    partyId: string;
    invoiceId: string;
    number: string;
    amount: string;
    currency: string;
    payLink: string;
  }): Promise<void> {
    return this.emit('invoice.issued', input.partyId, input);
  }

  private async emit(event: string, partyId: string, payload: Record<string, unknown>): Promise<void> {
    if (!this.baseUrl) return;
    try {
      const res = await fetch(new URL('/internal/events', this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event, partyId, payload }),
      });
      if (!res.ok) {
        this.logger.warn(`notifications returned ${res.status} for ${event}`);
      }
    } catch (err) {
      this.logger.warn(`notifications unreachable for ${event}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
