import { Injectable, Logger } from '@nestjs/common';
import { CoreLedgerClient, LedgerError } from '../core-ledger/core-ledger.client';
import { NotificationsClient } from '../notifications/notifications.client';
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
 */
@Injectable()
export class SettlementService {
  private readonly logger = new Logger(SettlementService.name);

  constructor(
    private readonly intents: IntentsRepository,
    private readonly banks: BanksRepository,
    private readonly invoices: InvoicesRepository,
    private readonly ledger: CoreLedgerClient,
    private readonly notifications: NotificationsClient,
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

    // The amount the rail says actually moved, not the amount that was asked
    // for. They differ more often than they should — an operator fee, a
    // partial collection — and settling the requested figure when the rail
    // moved another is how a ledger stops matching a bank statement.
    const amount = callback.amount ?? intent.amount;
    if (amount !== intent.amount) {
      this.logger.warn(
        `${rail} settled ${amount} ${intent.currency} against intent ${intent.id} for ${intent.amount}; ` +
          `booking what the rail moved`,
      );
    }

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

    const first = await this.intents.markSettled(intent.id, tx.id);
    if (!first) {
      // A concurrent callback won. Both posted the same idempotency key, so
      // core-ledger returned the same transaction to both; nothing moved
      // twice.
      this.logger.log(`intent ${intent.id} was settled concurrently; no second journal entry was created`);
      return;
    }

    this.logger.log(`settled ${intent.id}: ${intent.direction} ${amount} ${intent.currency} → ${tx.id}`);

    if (intent.invoiceId) {
      await this.invoices.markPaid(intent.invoiceId, intent.id);
    }

    await this.notifications.paymentSettled({
      partyId: intent.partyId,
      intentId: intent.id,
      direction: intent.direction,
      amount,
      currency: intent.currency,
      ledgerTxId: tx.id,
    });
  }

  private async fail(intent: PaymentIntent, reason: string): Promise<void> {
    await this.intents.markFailed(intent.id, reason);
    this.logger.warn(`intent ${intent.id} failed: ${reason}`);
    await this.notifications.paymentFailed({
      partyId: intent.partyId,
      intentId: intent.id,
      direction: intent.direction,
      amount: intent.amount,
      currency: intent.currency,
      reason,
    });
  }
}
