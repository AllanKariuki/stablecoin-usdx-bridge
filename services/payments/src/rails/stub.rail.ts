import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { RailCallback, RailInitiation, RailProvider, RailRequest } from './rail-provider';

/**
 * StubRail settles instantly — but through the callback, not inline.
 *
 * That distinction is the whole design. A stub that returned
 * `{status: 'SETTLED'}` from `collect()` would let the settlement path go
 * completely untested until the day a real rail was plugged in, and the
 * settlement path is the code that decides money moved. So this one accepts
 * the request, returns PROCESSING, and fires its own callback a tick later
 * against exactly the endpoint M-Pesa posts to.
 *
 * It also fails on demand: an amount ending in `.13` is rejected by the rail.
 * A payments service whose demo data always succeeds has a failure path
 * nobody has ever run.
 */
@Injectable()
export class StubRail implements RailProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(StubRail.name);

  /**
   * Set by PaymentsModule to the callback handler. A function rather than an
   * injected service because the settlement service depends on the rail
   * registry, and injecting it back here would close a dependency cycle Nest
   * would refuse to resolve.
   */
  onCallback: ((callback: RailCallback) => Promise<void>) | null = null;

  /** Delay before the simulated callback. Tests set it to 0. */
  settleDelayMs = 250;

  collect(req: RailRequest): Promise<RailInitiation> {
    return this.accept(req, 'collect');
  }

  disburse(req: RailRequest): Promise<RailInitiation> {
    return this.accept(req, 'disburse');
  }

  private async accept(req: RailRequest, kind: string): Promise<RailInitiation> {
    const railRef = `stub_${kind}_${randomUUID().slice(0, 12)}`;

    // The one deliberate failure trigger. `.13` is arbitrary and memorable;
    // what matters is that a demo can produce a FAILED intent on purpose.
    const shouldFail = req.amount.endsWith('.13');

    this.logger.log(
      `stub rail ${kind} ${req.amount} ${req.currency} for intent ${req.intentId} → ${railRef}` +
        (shouldFail ? ' (will fail: amount ends in .13)' : ''),
    );

    // Deliberately not awaited: the caller is told "the rail has it", and the
    // outcome arrives the way a real rail's does.
    setTimeout(() => {
      void this.fire({
        railRef,
        status: shouldFail ? 'FAILED' : 'SETTLED',
        failureReason: shouldFail ? 'stub rail: simulated rejection by the counterparty bank' : undefined,
        amount: req.amount,
        raw: { rail: 'stub', kind, intentId: req.intentId },
      });
    }, this.settleDelayMs).unref?.();

    return { railRef, status: 'PROCESSING', customerAction: null };
  }

  private async fire(callback: RailCallback): Promise<void> {
    if (!this.onCallback) {
      this.logger.error(`stub rail produced a callback for ${callback.railRef} with nothing listening`);
      return;
    }
    try {
      await this.onCallback(callback);
    } catch (err) {
      // A rail that throws inside its own callback would, in production, be
      // retried by the provider. The stub has nobody to retry it, so the
      // failure is at least loud.
      this.logger.error(
        `settlement of ${callback.railRef} threw: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  parseCallback(body: unknown): RailCallback | null {
    if (typeof body !== 'object' || body === null) return null;
    const b = body as Record<string, unknown>;
    if (typeof b.railRef !== 'string') return null;
    return {
      railRef: b.railRef,
      status: (b.status as RailCallback['status']) ?? 'SETTLED',
      failureReason: typeof b.failureReason === 'string' ? b.failureReason : undefined,
      amount: typeof b.amount === 'string' ? b.amount : undefined,
      raw: b,
    };
  }
}
