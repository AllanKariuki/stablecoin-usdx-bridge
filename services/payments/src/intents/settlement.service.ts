import { Injectable, Logger } from '@nestjs/common';
import { AuditRequest, enqueueAuditEvent } from '@damp/nest-platform';
import { AUDIT, railActor, SERVICE } from '../audit/audit-actions';
import { CoreLedgerClient, LedgerError, LedgerTransaction } from '../core-ledger/core-ledger.client';
import { DbService } from '../db/db.service';
import { OutboxRelay } from '../outbox/outbox.relay';
import { OutboxRepository } from '../outbox/outbox.repository';
import { RailCallback } from '../rails/rail-provider';
import { BanksRepository } from '../banks/banks.repository';
import { InvoicesRepository } from '../invoices/invoices.repository';
import { decimalsFor, toScaled } from '../money/money';
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
   *
   * `audit` is the callback's HTTP request (source IP above all): when a
   * settlement is questioned, where the callback came from is the first
   * thing anyone asks.
   */
  async onRailCallback(rail: string, callback: RailCallback, audit: AuditRequest = {}): Promise<void> {
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
      await this.fail(intent, callback.failureReason ?? `${rail} reported a failure`, railActor(rail), audit);
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
      // Nothing changed, but this is the one path where a forged callback
      // would show itself, so the refusal is evidence in its own right.
      await this.db.transaction((q) =>
        enqueueAuditEvent(
          q,
          {
            actor: railActor(rail),
            onBehalfOf: intent.partyId,
            action: AUDIT.settlementRefused,
            subjectType: 'PAYMENT_INTENT',
            subjectId: intent.id,
            service: SERVICE,
            outcome: 'DENIED',
            metadata: { reportedAmount: callback.amount, expectedAmount: intent.amount, currency: intent.currency, railRef: callback.railRef },
          },
          audit,
        ),
      );
      return;
    }
    const amount = intent.amount;

    await this.settle(intent, amount, railActor(rail), audit);
  }

  /**
   * Posts the journal transaction and marks the intent.
   *
   * Public because an operator route (`POST /intents/:id/settle`) needs the
   * same path for a rail that confirmed out of band — and because having one
   * settlement implementation rather than two is the only way the operator
   * path is as correct as the automatic one.
   *
   * `actor` is who caused the settlement: the rail for a callback, the
   * customer for an internal transfer they asked for.
   */
  async settle(
    intent: PaymentIntent,
    amount: string,
    actor: string = railActor(intent.rail),
    audit: AuditRequest = {},
  ): Promise<void> {
    if (intent.ledgerTxId) {
      this.logger.log(`intent ${intent.id} is already settled as ${intent.ledgerTxId}; nothing to do`);
      return;
    }
    if (intent.status === 'CONVERTING') {
      // The one status this path cannot settle: its money is parked in a
      // redemption saga, and only the conversion poller's completeConversion
      // knows when the fiat leg may post.
      throw new Error(`intent ${intent.id} is CONVERTING; it settles through the conversion poller, not this path`);
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
          // Cross-currency (slice 4a): the payer's source wallet debits in
          // its own currency and the payee's wallet credits in the intent's,
          // across the stored quote — an FX payment, not a transfer. A USD-X
          // source never reaches this branch: it is CONVERTING and settles
          // through completeConversion.
          const crossCurrency =
            intent.sourceWalletId !== null &&
            intent.sourceCurrency !== null &&
            intent.sourceCurrency !== intent.currency.toUpperCase();
          if (crossCurrency) {
            const target = await this.ledger.ensureWallet(beneficiary.targetPartyId, intent.currency);
            tx = await this.ledger.payConverted({
              fromWalletId: intent.sourceWalletId!,
              toWalletId: target.id,
              amount: intent.sourceAmount!,
              quoteId: intent.quoteId!,
              reference: intent.id,
              idempotencyKey,
              actor: intent.partyId,
            });
            await this.assertConvertedNetCoversInvoice(intent, tx);
          } else {
            const target = await this.ledger.ensureWallet(beneficiary.targetPartyId, intent.currency);
            tx = await this.ledger.transfer({
              fromWalletId: intent.walletId,
              toWalletId: target.id,
              amount,
              reference: intent.id,
              idempotencyKey,
              actor: intent.partyId,
            });
          }
          break;
        }
      }
    } catch (err) {
      if (err instanceof LedgerError && err.terminal) {
        // The ledger says this movement is not allowed — overdrawn, frozen,
        // a closed period, a quote that is expired/already used/mismatched —
        // and will say so identically forever. The intent fails, and somebody
        // has to deal with money the rail has already moved.
        this.logger.error(
          `core-ledger refused settlement of ${intent.id}: ${err.message}. ` +
            `The rail has already moved the money; this needs a human.`,
        );
        await this.fail(intent, `ledger rejected settlement: ${err.body.slice(0, 500)}`, actor, audit);
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

    await this.finalize(intent, tx, amount, actor, audit);
  }

  /**
   * The conversion poller's settlement path: a USD-X-funded intent whose
   * redemption saga has reached a terminal state.
   *
   * The two-step exists because USD-X never converts through FX — a
   * redemption is the only way out, and its USD only lands once the burn
   * confirms on chain. This method is what the poller calls per claimed
   * CONVERTING intent; it is idempotent on the same terms as settle().
   */
  async completeConversion(intent: PaymentIntent, audit: AuditRequest = {}): Promise<void> {
    if (intent.status !== 'CONVERTING' || intent.ledgerTxId) {
      // Settled, failed or cancelled elsewhere (or by another poller's win).
      this.logger.log(`intent ${intent.id} is ${intent.status}; nothing for the conversion poller to do`);
      return;
    }
    const actor = intent.partyId;
    const idempotencyKey = `payments:${intent.id}`;

    // A crash between writing the intent and posting the redemption leaves
    // conversion_ref empty. Re-post it under the same idempotency key:
    // core-ledger derives the saga's correlation id from the key, so this
    // resumes the first call's saga rather than starting a second one.
    if (!intent.conversionRef) {
      try {
        const usd = await this.ledger.ensureWallet(intent.partyId, 'USD');
        const redemption = await this.ledger.redeem({
          usdxWalletId: intent.sourceWalletId!,
          fiatWalletId: usd.id,
          amount: intent.sourceAmount!,
          idempotencyKey: `${idempotencyKey}:redeem`,
          actor,
        });
        if (redemption.correlation_id) {
          await this.intents.setConversionRef(intent.id, redemption.correlation_id);
        }
      } catch (err) {
        if (err instanceof LedgerError && err.terminal) {
          await this.fail(intent, `ledger rejected redemption: ${err.body.slice(0, 500)}`, railActor(intent.rail), audit);
          return;
        }
        // Don't-know: the claim lease re-polls.
        throw err;
      }
      // The saga row now exists; its state is only meaningful next poll.
      return;
    }

    const transfer = await this.ledger.getTransfer(intent.conversionRef, actor);
    if (!transfer) {
      this.logger.warn(`redemption saga ${intent.conversionRef} for intent ${intent.id} is unknown to core-ledger; waiting`);
      return;
    }
    switch (transfer.status) {
      case 'COMPLETED':
        break; // the burn is final and the USD is in the payer's wallet
      case 'FAILED':
      case 'COMPENSATED':
        // The saga reverses the redemption itself when it fails before the
        // burn confirmed — the USD-X parked in suspense returns to the wallet
        // it came from (core-ledger/internal/bridge/saga.go recoverTerminal).
        // payments only records the outcome. A failure past BURN_CONFIRMED is
        // not reversed (the burn is real) and is for ledger operators, not
        // this poller.
        await this.fail(
          intent,
          `USD-X redemption saga ${transfer.status}: ${transfer.last_error || 'no saga detail'}`,
          railActor(intent.rail),
          audit,
        );
        return;
      default:
        // PENDING / BURN_CONFIRMED: in flight. The claim lease re-polls.
        this.logger.log(`redemption saga ${intent.conversionRef} for intent ${intent.id} is ${transfer.status}; waiting`);
        return;
    }

    const beneficiary = intent.beneficiaryId ? await this.banks.findBeneficiary(intent.beneficiaryId) : null;
    if (!beneficiary?.targetPartyId) {
      throw new Error(`intent ${intent.id} is a TRANSFER with no in-platform beneficiary`);
    }
    const target = await this.ledger.ensureWallet(beneficiary.targetPartyId, intent.currency);
    // The redemption credited the payer's USD wallet — ensured again here
    // (idempotent) so the poller needs nothing extra stored at create.
    const usd = await this.ledger.ensureWallet(intent.partyId, 'USD');

    let tx;
    try {
      if (intent.currency.toUpperCase() === 'USD') {
        // The 1:1 leg: the redemption landed USD for USD-X, so a plain
        // transfer is the whole of the settlement. (With a redemption fee
        // configured in the ledger the credit is smaller and the transfer is
        // refused with INSUFFICIENT_FUNDS; the intent fails and the USD
        // stays in the payer's wallet.)
        tx = await this.ledger.transfer({
          fromWalletId: usd.id,
          toWalletId: target.id,
          amount: intent.amount,
          reference: intent.id,
          idempotencyKey,
          actor,
        });
      } else {
        // The quoted leg: the USD redeems into the payer's wallet and then
        // converts to the target currency across the quote the client
        // supplied at create.
        tx = await this.ledger.payConverted({
          fromWalletId: usd.id,
          toWalletId: target.id,
          amount: intent.sourceAmount!,
          quoteId: intent.quoteId!,
          reference: intent.id,
          idempotencyKey,
          actor,
        });
        await this.assertConvertedNetCoversInvoice(intent, tx);
      }
    } catch (err) {
      if (err instanceof LedgerError && err.terminal) {
        // The burn has confirmed and the redeemed USD sits in the payer's
        // USD wallet. The one refusal that is routine rather than a bug is a
        // quote that expired while the burn was confirming — on-chain
        // finality is slower than a quote TTL. The USD stays where it is;
        // the intent fails under its own code so the customer is told the
        // conversion (not the redemption) failed.
        const reason =
          err.code === 'QUOTE_EXPIRED'
            ? 'QUOTE_EXPIRED_DURING_CONVERSION: the FX quote expired while the USD-X burn confirmed; the redeemed USD remains in the payer\'s USD wallet'
            : `ledger rejected settlement: ${err.body.slice(0, 500)}`;
        await this.fail(intent, reason, railActor(intent.rail), audit);
        return;
      }
      // Don't-know: the claim lease re-polls, and the idempotency key makes
      // the retry a replay.
      throw err;
    }

    await this.finalize(intent, tx, intent.amount, actor, audit);
  }

  /**
   * The defensive check behind an invoice paid across a conversion: the net
   * the ledger booked must cover the invoice amount. It always should — a
   * TO-side quote was minted for exactly that net — so a miss is a bug, and
   * bugs fail loudly: the money moved, the intent stays un-settled
   * (PROCESSING/CONVERTING) for an operator, and this throws so the error is
   * on the call path rather than only in a journal.
   */
  private async assertConvertedNetCoversInvoice(intent: PaymentIntent, tx: LedgerTransaction): Promise<void> {
    if (!intent.invoiceId) return;
    const invoice = await this.invoices.find(intent.invoiceId);
    if (!invoice) return; // markPaid tolerates a missing invoice the same way

    // PayConverted stamps gross/fee/net into the transaction metadata as
    // smallest-unit integer strings (core-ledger/internal/ledger/flows.go);
    // metadata.net is the figure the payee's wallet was credited. Reading the
    // field rather than reconstructing it from the journal legs' prose is what
    // makes the check independent of wording in flows.go. A response without a
    // well-formed net is a contract break, and gets the same loud treatment as
    // a shortfall — not a silent pass.
    const net = tx.metadata?.net;
    if (typeof net !== 'string' || !/^\d+$/.test(net)) {
      this.logger.error(
        `FX payment ${tx.id} for invoice ${intent.invoiceId} carries no metadata.net ` +
          `(got ${JSON.stringify(tx.metadata ?? null)}); this is a core-ledger response bug and needs operator review`,
      );
      throw new Error(`FX payment ${tx.id} for invoice ${intent.invoiceId} carries no metadata.net`);
    }
    // Both sides are smallest units of the invoice's currency, so the compare
    // is exact integer arithmetic — no decimal coercion.
    const paid = BigInt(net);
    const required = toScaled(invoice.amount, decimalsFor(invoice.currency));
    if (paid < required) {
      this.logger.error(
        `FX payment ${tx.id} net ${net} ${invoice.currency} is below invoice ` +
          `${intent.invoiceId} amount ${invoice.amount}; refusing to mark the invoice paid`,
      );
      throw new Error(`FX payment ${tx.id} net ${net} is below invoice ${intent.invoiceId} amount ${invoice.amount}`);
    }
  }

  /**
   * Intent, invoice and event commit together. Before the outbox, the event
   * was a POST made after this point, and a notifications outage here meant
   * the customer was never told; an invoice marked in a separate statement
   * could also stay OPEN after the intent that paid it settled.
   */
  private async finalize(
    intent: PaymentIntent,
    tx: LedgerTransaction,
    amount: string,
    actor: string,
    audit: AuditRequest,
  ): Promise<void> {
    const ledgerTxId = tx.id;
    const first = await this.db.transaction(async (q) => {
      if (!(await this.intents.markSettled(intent.id, ledgerTxId, q))) return false;
      if (intent.invoiceId) {
        await this.invoices.markPaid(intent.invoiceId, intent.id, q);
      }
      await enqueueAuditEvent(
        q,
        {
          actor,
          onBehalfOf: actor === intent.partyId ? undefined : intent.partyId,
          action: AUDIT.intentSettled,
          subjectType: 'PAYMENT_INTENT',
          subjectId: intent.id,
          service: SERVICE,
          beforeState: { status: intent.status },
          afterState: { status: 'SETTLED', ledgerTxId, amount, currency: intent.currency },
          metadata: { direction: intent.direction, rail: intent.rail, railRef: intent.railRef, invoiceId: intent.invoiceId },
        },
        audit,
      );
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

  private async fail(intent: PaymentIntent, reason: string, actor: string, audit: AuditRequest): Promise<void> {
    const transitioned = await this.db.transaction(async (q) => {
      if (!(await this.intents.markFailed(intent.id, reason, q))) return false;
      await enqueueAuditEvent(
        q,
        {
          actor,
          onBehalfOf: actor === intent.partyId ? undefined : intent.partyId,
          action: AUDIT.intentFailed,
          subjectType: 'PAYMENT_INTENT',
          subjectId: intent.id,
          service: SERVICE,
          outcome: 'FAILURE',
          beforeState: { status: intent.status },
          afterState: { status: 'FAILED' },
          metadata: { reason, rail: intent.rail, railRef: intent.railRef },
        },
        audit,
      );
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
