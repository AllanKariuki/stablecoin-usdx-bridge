import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IntentsRepository, PaymentIntent } from './intents.repository';
import { SettlementService } from './settlement.service';

/** How long a claimed intent is hidden from other pollers while one works it. */
const LEASE_SECONDS = 60;
const BATCH_SIZE = 20;

/**
 * Completes CONVERTING intents: payments whose source is a USD-X wallet.
 *
 * Those settle in two steps — POST /redemptions parks the USD-X in suspense
 * and the USD lands in the payer's USD wallet only once the burn saga is
 * final — so no rail callback will ever arrive for them. This poller is the
 * timer that replaces it: it claims CONVERTING intents on a lease (FOR
 * UPDATE SKIP LOCKED, the outbox relay's claim shape, so every payments
 * replica can run one), asks core-ledger where the saga is, and hands the
 * terminal ones to SettlementService to post the fiat leg.
 */
@Injectable()
export class ConversionPoller implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConversionPoller.name);
  private readonly intervalSeconds: number;
  private timer: NodeJS.Timeout | null = null;

  /** One drain at a time per process; a kick during a drain asks for another pass. */
  private draining: Promise<void> | null = null;
  private again = false;

  constructor(
    private readonly intents: IntentsRepository,
    private readonly settlement: SettlementService,
    config: ConfigService,
  ) {
    this.intervalSeconds = Number(config.get('CONVERTING_POLL_SECONDS', { infer: true }) ?? 10);
  }

  onModuleInit(): void {
    this.timer = setInterval(() => this.kick(), this.intervalSeconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Asks for a drain soon. Never throws, never blocks the caller. */
  kick(): void {
    void this.drain().catch((err) =>
      this.logger.error(`conversion poll failed: ${err instanceof Error ? err.message : String(err)}`),
    );
  }

  /**
   * Works every due CONVERTING intent. Resolves once this process has no
   * drain running, which is what lets tests await a deterministic end state.
   */
  async drain(): Promise<void> {
    if (this.draining) {
      this.again = true;
      return this.draining;
    }
    this.draining = (async () => {
      try {
        do {
          this.again = false;
          let batch: PaymentIntent[];
          do {
            batch = await this.intents.claimConverting(BATCH_SIZE, LEASE_SECONDS);
            for (const intent of batch) await this.handle(intent);
          } while (batch.length === BATCH_SIZE);
        } while (this.again);
      } finally {
        this.draining = null;
      }
    })();
    return this.draining;
  }

  private async handle(intent: PaymentIntent): Promise<void> {
    try {
      await this.settlement.completeConversion(intent);
    } catch (err) {
      // A don't-know (core-ledger unreachable) or a loud invariant failure
      // (an invoice whose converted net came in short): leave the intent
      // CONVERTING — the claim lease re-polls — and make noise.
      this.logger.error(
        `conversion settlement of ${intent.id} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
