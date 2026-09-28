import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { BanksRepository } from '../banks/banks.repository';
import { CoreLedgerClient } from '../core-ledger/core-ledger.client';
import { toScaled } from '../money/money';
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

  constructor(
    private readonly intents: IntentsRepository,
    private readonly banks: BanksRepository,
    private readonly ledger: CoreLedgerClient,
    private readonly rails: RailRegistry,
  ) {}

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
  }): Promise<PaymentIntent> {
    this.assertAmount(input.amount, input.currency);

    // The wallet the money lands in or leaves from. Ensured rather than
    // looked up: core-ledger's POST /wallets is idempotent on
    // (user, currency, chain), so a first-ever deposit doesn't need a
    // separate onboarding step.
    const wallet = await this.ledger.ensureWallet(input.partyId, input.currency);

    let rail = 'stub';
    let accountRef = input.phoneNumber ?? '';
    let accountName = '';

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
      const beneficiary = await this.banks.findBeneficiary(input.beneficiaryId);
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

    const { intent, created } = await this.intents.create({
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
    });

    if (!created) {
      // A retry of the same request. Returning the existing intent rather
      // than calling the rail a second time is the whole point of the
      // idempotency key — a second STK push would prompt the customer twice
      // for one payment.
      this.logger.log(`intent ${intent.id} already exists for this idempotency key; returning it unchanged`);
      return intent;
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
        await this.intents.markFailed(intent.id, initiation.failureReason ?? 'the rail refused the request');
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
      await this.intents.markFailed(intent.id, `the rail could not be reached: ${message}`);
      throw new BadRequestException(message);
    }
  }

  async cancel(id: string, partyId: string): Promise<boolean> {
    // Only REQUIRES_ACTION cancels. Once a rail has the request, cancelling
    // in this database would leave an intent that says CANCELLED while money
    // is still moving.
    return this.intents.markCancelled(id, partyId);
  }

  private assertAmount(amount: string, currency: string): void {
    let scaled: bigint;
    try {
      scaled = toScaled(amount, currency === 'USDX' ? 6 : 2);
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'invalid amount');
    }
    if (scaled <= 0n) {
      throw new BadRequestException('amount must be greater than zero');
    }
  }
}
