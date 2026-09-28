import { Injectable, Logger } from '@nestjs/common';
import { MpesaRail } from './mpesa.rail';
import { RailProvider } from './rail-provider';
import { StubRail } from './stub.rail';

/**
 * Resolves a rail name to its provider.
 *
 * Falling back to the stub for an unknown or unconfigured name is deliberate
 * and logged loudly: a demo environment with no Daraja credentials should
 * still be able to take a deposit against an M-Pesa-flagged bank, and the
 * alternative — a 500 from a route the frontend already calls — makes the
 * whole payments surface look broken because one optional integration is
 * unconfigured.
 */
@Injectable()
export class RailRegistry {
  private readonly logger = new Logger(RailRegistry.name);
  private readonly rails = new Map<string, RailProvider>();

  constructor(
    private readonly stub: StubRail,
    mpesa: MpesaRail,
  ) {
    this.rails.set(stub.name, stub);
    if (mpesa.configured) {
      this.rails.set(mpesa.name, mpesa);
      this.logger.log('M-Pesa rail configured (Daraja)');
    } else {
      this.logger.warn('M-Pesa rail is not configured; M-Pesa banks will use the stub rail');
    }
  }

  get(name: string): RailProvider {
    const rail = this.rails.get(name);
    if (rail) return rail;
    this.logger.warn(`no rail named "${name}"; falling back to the stub`);
    return this.stub;
  }

  /** Every rail that could have produced a callback, for callback matching. */
  all(): RailProvider[] {
    return [...this.rails.values()];
  }
}
