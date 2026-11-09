import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SIGNATURE_HEADER, signCallback } from './callback-signature';
import { RequestsService } from './requests.service';

/**
 * Delivering a decision back to the service that asked.
 *
 * An approval nobody hears about is the same as no approval, so this retries
 * with backoff rather than firing once at decision time. It is the reason
 * `decide` returns immediately: the approver should not wait on a downstream
 * service being up, and the downstream service should not miss the decision
 * because it happened to be restarting.
 *
 * Two things make a callback actionable, and neither is enough alone. The
 * **payload digest** says which payload was approved; the receiver
 * re-computes it over its own stored object and refuses on mismatch. The
 * **HMAC signature** says workflow sent it — the digest alone cannot, because
 * anyone who can read the subject can recompute it. Receivers also check the
 * request id against the one they recorded when they asked for approval.
 */
@Injectable()
export class CallbacksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CallbacksService.name);
  private timer: NodeJS.Timeout | null = null;
  private readonly maxAttempts = 10;

  constructor(
    private readonly requests: RequestsService,
    private readonly config: ConfigService,
  ) {}

  onModuleInit(): void {
    const seconds = this.config.get<number>('CALLBACK_DRAIN_SECONDS', { infer: true }) ?? 15;
    this.timer = setInterval(() => {
      void this.drain();
      void this.requests.expireLapsed();
    }, seconds * 1000);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async drain(): Promise<number> {
    const pending = await this.requests.undeliveredCallbacks();
    let delivered = 0;

    const secret = this.config.get<string>('CALLBACK_SECRET') ?? '';
    for (const request of pending) {
      try {
        if (!secret) {
          // Unsigned callbacks would be refused by every receiver; sending
          // them would burn the retry budget on a config mistake.
          throw new Error('CALLBACK_SECRET is not set; refusing to send an unsigned decision callback');
        }
        const res = await fetch(request.callbackUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // The receiving service dedupes on this: delivery is
            // at-least-once, and acting twice on one approval is exactly the
            // double-payout maker-checker exists to prevent.
            'Idempotency-Key': `workflow:${request.id}:${request.status}`,
            [SIGNATURE_HEADER]: signCallback(secret, {
              requestId: request.id,
              subjectType: request.subjectType,
              subjectId: request.subjectId,
              payloadDigest: request.payloadDigest,
              status: request.status,
            }),
          },
          body: JSON.stringify({
            requestId: request.id,
            action: request.action,
            subjectType: request.subjectType,
            subjectId: request.subjectId,
            // Re-verify this against your own stored object before acting.
            payloadDigest: request.payloadDigest,
            status: request.status,
            approvals: request.approvals.map((a) => ({
              decision: a.decision,
              decidedBy: a.decidedBy,
              at: a.createdAt.toISOString(),
            })),
            decidedAt: request.decidedAt?.toISOString() ?? null,
          }),
          signal: AbortSignal.timeout(10_000),
        });

        if (res.ok) {
          await this.requests.markCallbackDelivered(request.id);
          delivered += 1;
          continue;
        }
        await this.fail(request.id, `callback returned ${res.status}`, false);
      } catch (err) {
        await this.fail(request.id, err instanceof Error ? err.message : String(err), false);
      }
    }
    return delivered;
  }

  private async fail(id: string, reason: string, _dead: boolean): Promise<void> {
    const request = await this.requests.find(id);
    // Dead-lettering a *decision* is serious: an approved payout whose
    // callback never landed is money somebody authorized and nobody moved.
    // It is logged at error so the operator queue is not the only place it
    // shows up.
    const attempts = (request?.approvals.length ?? 0) + 1;
    const dead = attempts >= this.maxAttempts;
    if (dead) {
      this.logger.error(
        `approval ${id} could not be delivered after ${this.maxAttempts} attempts: ${reason}. ` +
          `The decision stands in this service; the calling service has not heard it.`,
      );
    }
    await this.requests.markCallbackFailed(id, reason, dead);
  }
}
