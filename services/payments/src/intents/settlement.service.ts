import { Injectable, Logger } from '@nestjs/common';
import { CoreLedgerClient, LedgerError } from '../core-ledger/core-ledger.client';
import { DbService } from '../db/db.service';
import { OutboxRelay } from '../outbox/outbox.relay';
import { OutboxRepository } from '../outbox/outbox.repository';
import { RailCallback } from '../rails/rail-provider';
import { BanksRepository } from '../banks/banks.repository';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { IntentsRepository, PaymentIntent } from './intents.repository';

/**
 * Settlement is the code that decides money moved. It is deliberately the
 * smallest, dullest thing in this service.
 *
 * The order is: **the rail confirms, then the ledger posts, then the intent
 * is marked settled.** Marking the intent first would mean a crash between
 * the two leaves a payment that says SETTLED with no journal entry behind it
 * — a balance that exists in a dashboard and nowhere else. Posting first and
 * marking after means a crash leaves a journal entry and an intent that still
 * says PROCESSING, which the next callback (or a human) resolves correctly,
 * because the ledger write is idempotent on a key derived from the intent.
 *
 * Nothing here is a distributed transaction and nothing needs to be. There is
 * exactly one write that moves value, and it is idempotent.
 *
 * Telling the customer is not a separate step that can be lost. The event
 * announcing a settlement or failure is written to the outbox in the same
 * local transaction as the intent's status change, and the relay delivers it
 * to notifications whenever notifications is up — so a notifications outage
 * at the moment of settlement delays the email rather than dropping it.
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly intents: IntentsRepository,
    private readonly banks: BanksRepository,
    private readonly invoices: InvoicesRepository,
    private readonly ledger: CoreLedgerClient,
    private readonly db: DbService,
    private readonly outbox: OutboxRepository,
    private readonly relay: OutboxRelay,
  ) {}

  /**
   * Handles one callback from a rail.
   *
   * Every real rail delivers callbacks at-least-once, so this is called more
   * than once for the same payment as a matter of routine, not as an error
   * case.
   */
  async onRailCallback(rail: string, callback: RailCallback): Promise<void> {
    const intent = await this.intents.findByRailRef(rail, callback.railRef);
    if (!intent) {
      // Not an error worth throwing over: a callback for a reference this
      // platform never issued is either another tenant's, or a replay from
      // before a database reset. Logged and dropped, because 500-ing at a
      // rail makes it retry forever.
      this.logger.warn(`callback for unknown ${rail} reference ${callback.railRef}; ignoring`);
      return;
    }

    if (callback.status === 'FAILED') {
      await this.fail(intent, callback.failureReason ?? `${rail} reported a failure`);
      return;
    }
    if (callback.status !== 'SETTLED') {
      this.logger.log(`${rail} reports ${intent.id} is ${callback.status}; waiting`);
      return;
    }

    // A callback may not choose the figure that gets booked. A rail that
    // reports a different amount than the intent asked for is either a partial
    // collection, an operator fee, or a forged callback, and the ledger cannot
    // tell which. Booking it automatically lets whoever can reach this route
    // credit an arbitrary amount; so a mismatch is not booked. The intent
    // stays PROCESSING for an operator to resolve against the bank statement.
    if (callback.amount !== undefined && callback.amount !== intent.amount) {
      this.logger.error(
        `${rail} reported ${callback.amount} ${intent.currency} against intent ${intent.id} for ${intent.amount}; ` +
          `NOT settling — needs operator review`,
      );
      return;
    }
    const amount = intent.amount;

    await this.settle(intent, amount);
  }

  /**
   * Posts the journal transaction and marks the intent.
   *
   * Public because an operator route (`POST /intents/:id/settle`) needs the
   * same path for a rail that confirmed out of band — and because having one
   * settlement implementation rather than two is the only way the operator
   * path is as correct as the automatic one.
   */
  async settle(intent: PaymentIntent, amount: string): Promise<void> {
    if (intent.ledgerTxId) {
      this.logger.log(`intent ${intent.id} is already settled as ${intent.ledgerTxId}; nothing to do`);
      return;
    }

    // Derived from the intent, never generated. This is what makes a
    // duplicate callback harmless: core-ledger replays the first call's
    // stored response rather than posting twice.
    const idempotencyKey = `payments:${intent.id}`;

    let tx;
    try {
      switch (intent.direction) {
        case 'DEPOSIT':
          tx = await this.ledger.deposit({
            walletId: intent.walletId,
            amount,
            reference: intent.id,
            idempotencyKey,
            actor: intent.partyId,
          });
          break;

        case 'WITHDRAWAL':
          tx = await this.ledger.withdraw({
            walletId: intent.walletId,
            amount,
            reference: intent.id,
            idempotencyKey,
            actor: intent.partyId,
          });
          break;

        case 'TRANSFER': {
          const beneficiary = intent.beneficiaryId
            ? await this.banks.findBeneficiary(intent.beneficiaryId)
            : null;
          if (!beneficiary?.targetPartyId) {
            throw new Error(`intent ${intent.id} is a TRANSFER with no in-platform beneficiary`);
          }
          const target = await this.ledger.ensureWallet(beneficiary.targetPartyId, intent.currency);
          tx = await this.ledger.transfer({
            fromWalletId: intent.walletId,
            toWalletId: target.id,
            amount,
            reference: intent.id,
            idempotencyKey,
            actor: intent.partyId,
          });
          break;
        }
      }
    } catch (err) {
      if (err instanceof LedgerError && err.terminal) {
        // The ledger says this movement is not allowed — overdrawn, frozen,
        // a closed period — and will say so identically forever. The intent
        // fails, and somebody has to deal with money the rail has already
        // moved.
        this.logger.error(
          `core-ledger refused settlement of ${intent.id}: ${err.message}. ` +
            `The rail has already moved the money; this needs a human.`,
        );
        await this.fail(intent, `ledger rejected settlement: ${err.body.slice(0, 500)}`);
        return;
      }
      // "We don't know." The intent must NOT be marked failed: the rail moved
      // the money and the ledger may or may not have recorded it. Re-throwing
      // makes the rail retry, and the idempotency key makes the retry safe.
      this.logger.error(
        `settlement of ${intent.id} could not be completed: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw err;
    }

    // Intent, invoice and event commit together. Before the outbox, the
    // event was a POST made after this point, and a notifications outage
    // here meant the customer was never told; an invoice marked in a separate
    // statement could also stay OPEN after the intent that paid it settled.
    const ledgerTxId = tx.id;
    const first = await this.db.transaction(async (q) => {
      if (!(await this.intents.markSettled(intent.id, ledgerTxId, q))) return false;
      if (intent.invoiceId) {
        await this.invoices.markPaid(intent.invoiceId, intent.id, q);
      }
      await this.outbox.enqueue(q, {
        event: 'payment.settled',
        partyId: intent.partyId,
        payload: {
          partyId: intent.partyId,
          intentId: intent.id,
          direction: intent.direction,
          amount,
          currency: intent.currency,
          ledgerTxId,
        },
      });
      return true;
    });
    if (!first) {
      // A concurrent callback won. Both posted the same idempotency key, so
      // core-ledger returned the same transaction to both; nothing moved
      // twice, and only the winner wrote an event.
      this.logger.log(`intent ${intent.id} was settled concurrently; no second journal entry was created`);
      return;
    }

    this.logger.log(`settled ${intent.id}: ${intent.direction} ${amount} ${intent.currency} → ${tx.id}`);
    this.relay.kick();
  }

  private async fail(intent: PaymentIntent, reason: string): Promise<void> {
    const transitioned = await this.db.transaction(async (q) => {
      if (!(await this.intents.markFailed(intent.id, reason, q))) return false;
      await this.outbox.enqueue(q, {
        event: 'payment.failed',
        partyId: intent.partyId,
        payload: {
          partyId: intent.partyId,
          intentId: intent.id,
          direction: intent.direction,
          amount: intent.amount,
          currency: intent.currency,
          reason,
        },
      });
      return true;
    });
    if (!transitioned) {
      // Already settled, cancelled or failed. A late or repeated failure
      // callback must not tell a customer whose money landed that it didn't.
      this.logger.log(`intent ${intent.id} not marked failed (already terminal): ${reason}`);
      return;
    }
    this.logger.warn(`intent ${intent.id} failed: ${reason}`);
    this.relay.kick();
  }
}
