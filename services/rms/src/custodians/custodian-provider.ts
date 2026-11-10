import { Logger } from '@nestjs/common';
import { Money, addDecimal } from '../money/money';

/**
 * What a custodian said it holds, and when.
 *
 * `asOf` is the custodian's own timestamp, not the moment we asked. The
 * difference is the whole reason Leg C records staleness: a bank that
 * answers instantly with yesterday's figure and one that answers slowly
 * with a current figure are not the same situation, and a `fetchedAt`
 * would make them look identical.
 */
export interface CustodianBalance {
  balance: Money;
  asOf: Date;
  statementRef: string;
}

/**
 * The seam every real bank adapter will implement.
 *
 * Interface + stub is the plan's explicit position on vendors
 * (docs/building-plan.md, "What NOT to build yet": no real vendor
 * contracts, sandbox only where free and self-service). What matters for
 * P3 is that Leg C has a writer at all — it has been skipped on every
 * reconciliation run this platform has ever performed, because
 * trust_bank_snapshot's only documented writer was a service that does not
 * exist.
 */
export interface CustodianProvider {
  readonly name: string;
  fetchBalance(custodian: {
    id: string;
    currency: string;
    accountRef: string;
    config: Record<string, unknown>;
  }): Promise<CustodianBalance>;
}

/**
 * StubCustodianProvider reports what core-ledger says the platform's cash
 * position should be, plus a configurable drift.
 *
 * Deriving the base figure from the ledger rather than from a random number
 * is what makes the stub useful: with drift at zero, Leg C passes for the
 * right reason, and the demo is "change one number and watch a control
 * fire" rather than "watch a control fire because the fake data never
 * agreed with anything".
 *
 * The drift is the point. A reconciliation leg nobody has ever seen break
 * is a leg nobody knows works — R7 in the risk register is precisely that
 * the one control catching an unbacked mint was decorative. So `drift`
 * lives in the custodian's config, POST /custodians/:id/drift sets it, and
 * the DoD's "$1,000 short" is `-1000.00`.
 *
 * Not @Injectable: it takes a closure over core-ledger rather than an
 * injectable dependency, and CustodiansService constructs it directly. A
 * decorator here would advertise a provider Nest could never resolve.
 */
export class StubCustodianProvider implements CustodianProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(StubCustodianProvider.name);

  constructor(private readonly ledgerCash: (currency: string) => Promise<Money>) {}

  async fetchBalance(custodian: {
    id: string;
    currency: string;
    accountRef: string;
    config: Record<string, unknown>;
  }): Promise<CustodianBalance> {
    const base = await this.ledgerCash(custodian.currency);
    const drift = typeof custodian.config.drift === 'string' ? custodian.config.drift : '0';

    const balance = addDecimal(base, drift);
    if (drift !== '0' && drift !== '0.00') {
      this.logger.warn(
        `custodian ${custodian.id} is reporting a configured drift of ${drift} ${custodian.currency} ` +
          `(ledger says ${base.amount}, reporting ${balance.amount})`,
      );
    }

    return {
      balance,
      asOf: new Date(),
      statementRef: `${custodian.accountRef}/${new Date().toISOString().slice(0, 10)}`,
    };
  }
}
