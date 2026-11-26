import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';
import { PaymentsConfig } from '../config/payments-config';
import { MpesaRail } from './mpesa.rail';
import { RailProvider } from './rail-provider';
import { StubRail } from './stub.rail';

/**
 * Resolves a rail name to its provider.
 *
 * Nothing is registered implicitly and nothing falls back: a rail is present
 * only if this deployment can actually move money through it. Asking for a
 * rail that isn't registered is a 422 RAIL_UNAVAILABLE, because the
 * alternative — quietly settling against the stub — books ledger credit for
 * fiat that never arrived. The stub is registered only when STUB_RAIL_ENABLED
 * is set, and says so at boot.
 */
@Injectable()
export class RailRegistry {
  private readonly logger = new Logger(RailRegistry.name);
  private readonly rails = new Map<string, RailProvider>();

  constructor(
    config: ConfigService<PaymentsConfig, true>,
    stub: StubRail,
    mpesa: MpesaRail,
  ) {
    if (config.get('STUB_RAIL_ENABLED', { infer: true })) {
      this.rails.set(stub.name, stub);
      this.logger.warn('STUB RAIL ENABLED — deposits/withdrawals settle with no real money');
    }
    if (mpesa.configured) {
      this.rails.set(mpesa.name, mpesa);
      this.logger.log('M-Pesa rail configured (Daraja)');
    } else {
      this.logger.warn('M-Pesa rail is not configured; mpesa-flagged banks will be refused with RAIL_UNAVAILABLE');
    }
  }

  get(name: string): RailProvider {
    const rail = this.rails.get(name);
    if (!rail) {
      throw new PlatformException(422, 'RAIL_UNAVAILABLE', `the "${name}" rail is not available in this deployment`);
    }
    return rail;
  }

  /** Every rail this deployment registered, for callback matching. */
  all(): RailProvider[] {
    return [...this.rails.values()];
  }
}
