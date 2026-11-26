import { BadRequestException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuditRequest, enqueueAuditEvent, KycGate, PlatformException } from '@damp/nest-platform';
import { AUDIT, railActor, SERVICE } from '../audit/audit-actions';
import { BanksRepository } from '../banks/banks.repository';
import { CoreLedgerClient, LedgerError, LedgerWallet } from '../core-ledger/core-ledger.client';
import { DbService } from '../db/db.service';
import { decimalsFor, toScaled } from '../money/money';
import { RailRegistry } from '../rails/rail.registry';
import { IntentDirection, IntentsRepository, PaymentIntent } from './intents.repository';

/**
 * Creating a payment intent, and handing it to a rail.
 *
 * The two steps are separate rows in time on purpose: the intent is written
 * first, then the rail is called, then the rail's reference is recorded. A
 * crash between writing and calling leaves an intent in REQUIRES_ACTION with
 * no rail reference, which is visible and recoverable. Calling the rail first
 * would leave money in motion that this platform has no record of asking for.
 */
@Injectable()
export class IntentsService {
  private readonly logger = new Logger(IntentsService.name);
  private readonly minTier: string;

  constructor(
    private readonly intents: IntentsRepository,
    private readonly banks: BanksRepository,
    private readonly ledger: CoreLedgerClient,
    private readonly rails: RailRegistry,
    private readonly db: DbService,
    private readonly kycGate: KycGate,
    config: ConfigService,
  ) {
    this.minTier = config.get<string>('KYC_MIN_TIER_FIAT', { infer: true }) ?? 'TIER_1';
  }

  async create(input: {
    partyId: string;
    direction: IntentDirection;
    amount: string;
    currency: string;
    bankAccountId?: string;
    beneficiaryId?: string;
    invoiceId?: string;
    description?: string;
    idempotencyKey: string;
    phoneNumber?: string;
    audit?: AuditRequest;
    sourceWalletId?: string;
    sourceAmount?: string;
    quoteId?: string;
  }): Promise<PaymentIntent> {
    this.assertAmount(input.amount, input.currency);

    // H5: every direction moves value into or out of the party's wallet —
    // DEPOSIT funds it, WITHDRAWAL drains it, TRANSFER (P2P and invoice pay)
    // moves it between wallets — so all three are gated, sender side, and
    // the gate runs before any write, core-ledger call or rail call. A
    // party below KYC_MIN_TIER_FIAT gets 403 KYC_REQUIRED; an unreachable
    // kyc fails closed with 503 KYC_UNAVAILABLE.
    await this.kycGate.require(input.partyId, this.minTier);

    let rail = 'stub';
    let accountRef = input.phoneNumber ?? '';
    let accountName = '';
    let beneficiary: { kind: 'BANK' | 'WALLET' | 'MOBILE'; partyId: string; accountRef: string; name: string; targetPartyId: string } | null = null;

    if (input.bankAccountId) {
      const account = await this.banks.findAccount(input.bankAccountId);
      if (!account || account.partyId !== input.partyId) {
        throw new NotFoundException('no such bank account');
      }
      if (input.direction === 'WITHDRAWAL' && account.status !== 'VERIFIED') {
        // Paying out to an account nobody has proved they control is the
        // mistake the PENDING/VERIFIED split exists to prevent. Deposits are
        // fine against an unverified account: money arriving is its own proof.
        throw new BadRequestException(
          `bank account ${account.id} is ${account.status}; a withdrawal needs a VERIFIED account`,
        );
      }
      const banks = await this.banks.availableBanks();
      rail = banks.find((b) => b.id === account.bankId)?.rail ?? 'stub';
      accountRef = accountRef || account.accountRef;
      accountName = account.accountName;
    } else if (input.beneficiaryId) {
      beneficiary = await this.banks.findBeneficiary(input.beneficiaryId);
      if (!beneficiary || beneficiary.partyId !== input.partyId) {
        throw new NotFoundException('no such beneficiary');
      }
      accountRef = beneficiary.accountRef;
      accountName = beneficiary.name;
      // A WALLET beneficiary never leaves the platform, so no rail is
      // involved at all — the "rail" is core-ledger's own transfer, which
      // settles immediately below.
      rail = beneficiary.kind === 'WALLET' ? 'internal' : rail;
    }

    // Resolve the rail before touching core-ledger or writing anything. A
    // selected rail that this deployment has not registered means the money
    // cannot move at all, so the intent fails here — before ensureWallet and
    // before the row exists — rather than leaving a payment record behind for
    // a movement that was never possible. 'internal' has no rail: the ledger's
    // own transfer is the rail, and it settles inline below.
    if (rail !== 'internal') {
      this.rails.get(rail);
    }

    // --- Cross-asset source (slice 4a). A sourceWalletId means the payer
    // picked a specific wallet rather than "the wallet for this currency".
    // The wallet is verified here, before anything is written: it must exist
    // and belong to the payer (a 404 either way, so the response does not
    // leak which ids exist) and be ACTIVE. Same-currency selection just
    // substitutes the wallet; cross-currency is an FX payment (or, for
    // USD-X, a redemption) and carries the extra rails below.
    let wallet: LedgerWallet;
    let sourceWalletId: string | null = null;
    let sourceCurrency: string | null = null;
    let quoteId: string | null = null;
    let sourceAmount: string | null = null;
    let status: 'CONVERTING' | undefined;

    if (input.sourceWalletId) {
      const source = await this.ledger.getWallet(input.sourceWalletId, input.partyId);
      if (!source || source.user_id !== input.partyId) {
        throw new NotFoundException('no such wallet');
      }
      if (source.status !== 'ACTIVE') {
        throw new BadRequestException(`wallet ${source.id} is ${source.status}; payments need an ACTIVE source wallet`);
      }
      const srcCcy = source.currency.toUpperCase();
      const targetCcy = input.currency.toUpperCase();

      if (srcCcy === targetCcy) {
        // Several wallets can hold the same currency (USD-X on ETH vs on
        // Solana); this lets the payer pick which one the intent uses.
        wallet = source;
        sourceWalletId = source.id;
        sourceCurrency = srcCcy;
      } else {
        // Cross-currency: the payee receives in the intent's currency while
        // the source wallet debits in another. Only internal movements can
        // convert — a DEPOSIT or WITHDRAWAL rail moves one currency by
        // itself, and a cross-currency bank payout has no wallet to credit.
        if (input.direction !== 'TRANSFER' || !beneficiary || beneficiary.kind !== 'WALLET') {
          throw new PlatformException(
            HttpStatus.UNPROCESSABLE_ENTITY,
            'CROSS_CURRENCY_RAIL_UNSUPPORTED',
            'paying from one currency into another needs a TRANSFER to an in-platform WALLET beneficiary (or an invoice pay)',
          );
        }
        if (srcCcy === 'USDX') {
          // USD-X converts through issuance/redemption, never FX. The
          // two-step: redeem the USD-X into the payer's USD wallet now
          // (status CONVERTING), and let the conversion poller post the fiat
          // leg once the burn saga completes. Redeeming into USD 1:1 covers
          // a USD target by itself — no quote involved; any other target
          // needs a USD->target quote for the second leg.
          if (targetCcy === 'USD') {
            sourceAmount = input.amount;
            quoteId = null; // no conversion follows the redemption
          } else {
            if (!input.quoteId) {
              throw new PlatformException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                'QUOTE_REQUIRED',
                'a USD-X-funded payment into another currency needs the quoteId of a USD quote pinned to this party',
              );
            }
            if (!input.sourceAmount) {
              throw new PlatformException(
                HttpStatus.UNPROCESSABLE_ENTITY,
                'SOURCE_AMOUNT_REQUIRED',
                'a cross-currency payment needs the source amount the quote is pinned to',
              );
            }
            this.assertAmount(input.sourceAmount, srcCcy);
            sourceAmount = input.sourceAmount;
            quoteId = input.quoteId;
          }
          status = 'CONVERTING';
        } else {
          // The quote is the proof of the rate: without one the ledger has
          // nothing to pin the movement to, and payments cannot invent one.
          if (!input.quoteId) {
            throw new PlatformException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'QUOTE_REQUIRED',
              'a cross-currency payment needs the quoteId of a quote pinned to this party',
            );
          }
          // The amount the source wallet debits is the quote's pinned
          // from_amount, which only the client (who minted the quote) knows.
          // The ledger enforces the pin; payments just carries the number.
          if (!input.sourceAmount) {
            throw new PlatformException(
              HttpStatus.UNPROCESSABLE_ENTITY,
              'SOURCE_AMOUNT_REQUIRED',
              'a cross-currency payment needs the source amount the quote is pinned to',
            );
          }
          this.assertAmount(input.sourceAmount, srcCcy);
          sourceAmount = input.sourceAmount;
          quoteId = input.quoteId;
        }

        wallet = source;
        sourceWalletId = source.id;
        sourceCurrency = srcCcy;
      }
    } else {
      // The wallet the money lands in or leaves from. Ensured rather than
      // looked up: core-ledger's POST /wallets is idempotent on
      // (user, currency, chain), so a first-ever deposit doesn't need a
      // separate onboarding step.
      wallet = await this.ledger.ensureWallet(input.partyId, input.currency);
    }

    // The intent and its audit event commit together, and only a new intent
    // is audited: an idempotent retry asked for nothing new.
    const { intent, created } = await this.db.transaction(async (q) => {
      const result = await this.intents.create(
        {
          partyId: input.partyId,
          direction: input.direction,
          amount: input.amount,
          currency: input.currency,
          walletId: wallet.id,
          bankAccountId: input.bankAccountId ?? null,
          beneficiaryId: input.beneficiaryId ?? null,
          invoiceId: input.invoiceId ?? null,
          rail,
          idempotencyKey: input.idempotencyKey,
          description: input.description,
          // CONVERTING only for the USD-X two-step; every other intent starts
          // as the repository's default.
          status: status ?? 'REQUIRES_ACTION',
          sourceWalletId,
          sourceCurrency,
          quoteId,
          sourceAmount,
        },
        q,
      );
      if (result.created) {
        const i = result.intent;
        await enqueueAuditEvent(
          q,
          {
            actor: input.partyId,
            action: AUDIT.intentCreated,
            subjectType: 'PAYMENT_INTENT',
            subjectId: i.id,
            service: SERVICE,
            afterState: {
              direction: i.direction,
              amount: i.amount,
              currency: i.currency,
              status: i.status,
              rail: i.rail,
              walletId: i.walletId,
              bankAccountId: i.bankAccountId,
              beneficiaryId: i.beneficiaryId,
              invoiceId: i.invoiceId,
              sourceWalletId: i.sourceWalletId,
              sourceCurrency: i.sourceCurrency,
              quoteId: i.quoteId,
              sourceAmount: i.sourceAmount,
            },
            metadata: { idempotencyKey: input.idempotencyKey, description: i.description },
          },
          input.audit,
        );
      }
      return result;
    });

    if (!created) {
      // A retry of the same request. Returning the existing intent rather
      // than calling the rail a second time is the whole point of the
      // idempotency key — a second STK push would prompt the customer twice
      // for one payment, and a second redemption would ask for the same burn
      // twice.
      this.logger.log(`intent ${intent.id} already exists for this idempotency key; returning it unchanged`);
      return intent;
    }

    // A USD-X-funded intent moves money at creation: the redemption posts
    // now, and the conversion poller settles the fiat leg once the burn saga
    // completes. The idempotency key is derived from the intent id, and the
    // ledger derives the saga's correlation id from it — so a retried
    // redemption (here or in the poller's recovery) re-enters the same saga
    // instead of starting a second one.
    if (status === 'CONVERTING') {
      try {
        const usdWallet = await this.ledger.ensureWallet(input.partyId, 'USD');
        const redemption = await this.ledger.redeem({
          usdxWalletId: sourceWalletId!,
          fiatWalletId: usdWallet.id,
          amount: sourceAmount!,
          idempotencyKey: `payments:${intent.id}:redeem`,
          actor: input.partyId,
        });
        if (redemption.correlation_id) {
          await this.intents.setConversionRef(intent.id, redemption.correlation_id);
        }
      } catch (err) {
        if (err instanceof LedgerError && err.terminal) {
          // The ledger refuses the redemption outright — a wallet that is
          // not USD-X, an overdraft, a missing chain. No money moved; the
          // intent fails here, before the caller ever sees a CONVERTING row.
          await this.failAtInitiation(intent, `the ledger refused the USD-X redemption: ${err.body.slice(0, 500)}`);
          throw new PlatformException(
            err.status,
            err.code || 'REDEMPTION_REFUSED',
            `the ledger refused the USD-X redemption: ${err.message}`,
          );
        }
        // "We don't know" — the redemption may or may not have posted. The
        // intent stays CONVERTING with an empty conversion_ref, and the
        // poller's recovery re-posts under the same idempotency key, which
        // makes that retry a replay rather than a second redemption.
        this.logger.error(
          `redemption for intent ${intent.id} could not be confirmed posted: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return (await this.intents.find(intent.id))!;
    }

    // An internal transfer has no rail to wait for. It is marked PROCESSING
    // and settled by the caller, which keeps one settlement path rather than
    // a second inline one that would drift from it.
    if (rail === 'internal') {
      await this.intents.recordRailAccepted(intent.id, `internal_${intent.id}`, 'PROCESSING');
      return (await this.intents.find(intent.id))!;
    }

    const provider = this.rails.get(rail);
    try {
      const initiation =
        input.direction === 'DEPOSIT'
          ? await provider.collect({
              intentId: intent.id,
              amount: input.amount,
              currency: input.currency,
              accountRef,
              accountName,
              description: input.description ?? '',
            })
          : await provider.disburse({
              intentId: intent.id,
              amount: input.amount,
              currency: input.currency,
              accountRef,
              accountName,
              description: input.description ?? '',
            });

      if (initiation.status === 'FAILED') {
        await this.failAtInitiation(intent, initiation.failureReason ?? 'the rail refused the request');
      } else {
        await this.intents.recordRailAccepted(intent.id, initiation.railRef, initiation.status);
      }

      const refreshed = (await this.intents.find(intent.id))!;
      // customerAction is not persisted: it is a live instruction ("enter
      // your PIN"), meaningless once the moment has passed, and storing it
      // would invite a UI to show a stale prompt.
      return { ...refreshed, metadata: { ...refreshed.metadata, customerAction: initiation.customerAction } };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.failAtInitiation(intent, `the rail could not be reached: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async cancel(id: string, partyId: string, audit: AuditRequest = {}): Promise<boolean> {
    // Only REQUIRES_ACTION cancels. Once a rail has the request, cancelling
    // in this database would leave an intent that says CANCELLED while money
    // is still moving.
    return this.db.transaction(async (q) => {
      if (!(await this.intents.markCancelled(id, partyId, q))) return false;
      await enqueueAuditEvent(
        q,
        {
          actor: partyId,
          action: AUDIT.intentCancelled,
          subjectType: 'PAYMENT_INTENT',
          subjectId: id,
          service: SERVICE,
          beforeState: { status: 'REQUIRES_ACTION' },
          afterState: { status: 'CANCELLED' },
        },
        audit,
      );
      return true;
    });
  }

  /**
   * The rail refused or could not be reached before it took the request. No
   * money moved, so there is no payment.failed notification here (the caller
   * gets the error in its response) — but the intent changed state on a
   * rail's say-so, which is what the audit event records.
   */
  private async failAtInitiation(intent: PaymentIntent, reason: string): Promise<void> {
    await this.db.transaction(async (q) => {
      if (!(await this.intents.markFailed(intent.id, reason, q))) return;
      await enqueueAuditEvent(q, {
        actor: railActor(intent.rail),
        onBehalfOf: intent.partyId,
        action: AUDIT.intentFailed,
        subjectType: 'PAYMENT_INTENT',
        subjectId: intent.id,
        service: SERVICE,
        outcome: 'FAILURE',
        beforeState: { status: intent.status },
        afterState: { status: 'FAILED' },
        metadata: { reason, stage: 'initiation' },
      });
    });
  }

  private assertAmount(amount: string, currency: string): void {
    let scaled: bigint;
    try {
      scaled = toScaled(amount, decimalsFor(currency));
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'invalid amount');
    }
    if (scaled <= 0n) {
      throw new BadRequestException('amount must be greater than zero');
    }
  }
}
