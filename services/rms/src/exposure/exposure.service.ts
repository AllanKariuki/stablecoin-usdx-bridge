import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformException } from '@damp/nest-platform';
import { CoreLedgerClient, TreasuryPosition } from '../core-ledger/core-ledger.client';
import { CustodianStatement, CustodiansRepository } from '../custodians/custodians.repository';
import { decimalsFor, fromScaled, isCustodialCrypto, toScaled } from '../money/money';
import { ExposureLimit, ExposureLimitsRepository } from './exposure-limits.repository';
import { TreasuryRebalance } from './treasury-rebalances.repository';

/**
 * The house's custodial-crypto exposure: the ledger's positions, the policy
 * limits around them, the custodian's word for the same holdings, and the
 * check every crypto-legged quote must pass before pricing mints a rate.
 *
 * All arithmetic is on scaled BigInts at each currency's own decimals — a
 * limit of "5" BTC is 5e8 satoshi and a delta of "-0.01" ETH is -1e16 wei,
 * and none of it ever passes through a float.
 */

export interface ReconStatus {
  status: 'MATCH' | 'DRIFT';
  tolerance: string;
  custodianReported: string;
  ledgerHoldings: string;
  diff: string;
}

export interface ExposureRow {
  currency: string;
  decimals: number;
  customerLiabilities: string;
  custodyHoldings: string;
  fxPosition: string;
  netExposure: string;
  limits: { maxShort: string; maxLong: string; updatedBy: string; updatedAt: string } | null;
  /** How much of the applicable limit the position uses, in basis points;
   * null when there is no limit for this currency. */
  utilisationBps: number | null;
  custodianSnapshot: {
    custodianIds: string[];
    balance: string;
    asOf: string;
    statementRef: string;
  } | null;
  recon: ReconStatus | null;
}

@Injectable()
export class ExposureService {
  private readonly tolerance: string;

  constructor(
    private readonly ledger: CoreLedgerClient,
    private readonly limits: ExposureLimitsRepository,
    private readonly custodians: CustodiansRepository,
    config: ConfigService,
  ) {
    this.tolerance = config.get<string>('CRYPTO_RECON_TOLERANCE', { infer: true }) ?? '0';
  }

  /**
   * GET /exposure's answer: for each custodial crypto currency, the ledger's
   * position, the policy limits, how much of them is used, the latest
   * custodian word for the same holdings, and whether the two agree.
   */
  async overview(): Promise<ExposureRow[]> {
    const positions = await this.ledger.treasuryPositions();
    const limitRows = await this.limits.list();
    const limitsByCurrency = new Map(limitRows.map((l) => [l.currency, l]));

    const rows: ExposureRow[] = [];
    for (const position of positions.filter((p) => isCustodialCrypto(p.currency))) {
      rows.push(await this.rowFor(position, limitsByCurrency.get(position.currency) ?? null));
    }
    return rows;
  }

  private async rowFor(position: TreasuryPosition, limit: ExposureLimit | null): Promise<ExposureRow> {
    const decimals = decimalsFor(position.currency);
    const net = toScaled(position.net_exposure, decimals);

    let recon: ReconStatus | null = null;
    let snapshot: ExposureRow['custodianSnapshot'] = null;
    const statements = await this.custodians.latestStatements(position.currency);
    if (statements.length > 0) {
      const reported = statements.reduce<bigint>(
        (sum, s) => sum + toScaled(s.balance, decimals),
        0n,
      );
      const ledgerHoldings = toScaled(position.custody_holdings, decimals);
      const diff = reported - ledgerHoldings;
      const over = diff < 0n ? -diff : diff;
      const tolerance = toScaled(this.tolerance, decimals);
      const latest = newestStatement(statements);
      snapshot = {
        custodianIds: statements.map((s) => s.custodianId),
        balance: fromScaled(reported, decimals),
        asOf: latest.asOf.toISOString(),
        statementRef: latest.statementRef,
      };
      recon = {
        status: over > tolerance ? 'DRIFT' : 'MATCH',
        tolerance: this.tolerance,
        custodianReported: fromScaled(reported, decimals),
        ledgerHoldings: position.custody_holdings,
        diff: fromScaled(diff, decimals),
      };
    }

    return {
      currency: position.currency,
      decimals,
      customerLiabilities: position.customer_liabilities,
      custodyHoldings: position.custody_holdings,
      fxPosition: position.fx_position,
      netExposure: position.net_exposure,
      limits: limit && {
        maxShort: limit.maxShort,
        maxLong: limit.maxLong,
        updatedBy: limit.updatedBy,
        updatedAt: limit.updatedAt.toISOString(),
      },
      utilisationBps: utilisationBps(net, limit, decimals),
      custodianSnapshot: snapshot,
      recon,
    };
  }

  /**
   * POST /exposure/check: would the change `delta` to customer liabilities
   * push the house's position through a limit?
   *
   * delta is signed and in crypto units at the currency's scale: positive
   * means customers gain the currency (the house gets more short), negative
   * means customers give it back (the house gets more long). The projected
   * position is net_exposure - delta, compared against -max_short on the
   * downside and +max_long on the upside.
   */
  async check(currency: string, delta: string): Promise<{ ok: true; netExposure: string; projected: string }> {
    const decimals = decimalsFor(currency);
    let deltaScaled: bigint;
    try {
      deltaScaled = toScaled(delta, decimals);
    } catch {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_DELTA',
        `${delta} is not a ${currency} amount`,
      );
    }

    const positions = await this.ledger.treasuryPositions();
    const position = positions.find((p) => p.currency === currency);
    if (!position) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'UNKNOWN_CURRENCY',
        `core-ledger reports no ${currency} position`,
      );
    }

    const limit = await this.limits.find(currency);

    // Fail closed. A missing limits row is not "no policy, anything goes" —
    // an unset mandate means nobody has said how short the house may run
    // this currency, and this is real money: quoting against a position
    // with no defined bound is exactly what the limit exists to prevent.
    // Treasury sets one through PUT /exposure/limits/:currency before any
    // BTC/ETH/SOL quote can be minted (the migration seeds all three).
    if (!limit) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NO_EXPOSURE_POLICY',
        `no exposure mandate is set for ${currency}; treasury must set one before it can be quoted`,
      );
    }

    const net = toScaled(position.net_exposure, decimals);
    const projected = net - deltaScaled;
    const maxShort = toScaled(limit.maxShort, decimals);
    const maxLong = toScaled(limit.maxLong, decimals);
    if (projected < -maxShort || projected > maxLong) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'EXPOSURE_LIMIT_EXCEEDED',
        `${currency} exposure would be ${fromScaled(projected, decimals)}; the mandate is ` +
          `[-${limit.maxShort}, +${limit.maxLong}]`,
      );
    }

    return {
      ok: true,
      netExposure: position.net_exposure,
      projected: fromScaled(projected, decimals),
    };
  }

  /** The shared validation every rebalance passes before it reaches the ledger. */
  validateRebalance(input: {
    side: string;
    currency: string;
    amount: string;
    fiatCurrency: string;
    fiatAmount: string;
    custodianRef: string;
    note: string;
  }): Omit<TreasuryRebalance, 'id' | 'ledgerTxId' | 'createdBy' | 'createdAt'> {
    const side = input.side;
    if (side !== 'BUY' && side !== 'SELL') {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'INVALID_REBALANCE_SIDE',
        `side must be BUY or SELL, got "${side}"`,
      );
    }
    const currency = input.currency.toUpperCase();
    if (!isCustodialCrypto(currency)) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NOT_CUSTODIAL_CRYPTO',
        `rebalances trade custodial crypto (BTC/ETH/SOL), got "${currency}"`,
      );
    }
    const fiatCurrency = input.fiatCurrency.toUpperCase();
    if (!FIAT_CURRENCIES.includes(fiatCurrency)) {
      throw new PlatformException(
        HttpStatus.UNPROCESSABLE_ENTITY,
        'NOT_A_FIAT_CURRENCY',
        `the fiat leg must be one of ${FIAT_CURRENCIES.join('/')}, got "${fiatCurrency}"`,
      );
    }

    const amount = positiveDecimal(input.amount, currency, 'amount');
    const fiatAmount = positiveDecimal(input.fiatAmount, fiatCurrency, 'fiat_amount');

    return {
      side,
      currency,
      amount,
      fiatCurrency,
      fiatAmount,
      custodianRef: input.custodianRef?.trim() ?? '',
      note: input.note?.trim() ?? '',
    };
  }
}

const FIAT_CURRENCIES = ['USD', 'EUR', 'GBP', 'KES'];

/** Parses a strictly positive decimal at the currency's scale. */
function positiveDecimal(raw: string, currency: string, field: string): string {
  let scaled: bigint;
  try {
    scaled = toScaled(raw, decimalsFor(currency));
  } catch {
    throw new PlatformException(
      HttpStatus.UNPROCESSABLE_ENTITY,
      'INVALID_AMOUNT',
      `${raw} is not a ${currency} ${field}`,
    );
  }
  if (scaled <= 0n) {
    throw new PlatformException(HttpStatus.UNPROCESSABLE_ENTITY, 'INVALID_AMOUNT', `${field} must be greater than zero`);
  }
  return fromScaled(scaled, decimalsFor(currency));
}

function newestStatement(statements: CustodianStatement[]): CustodianStatement {
  return statements.reduce((newest, s) => (s.asOf > newest.asOf ? s : newest), statements[0]);
}

/** The position's use of its applicable limit, in integer basis points. */
function utilisationBps(net: bigint, limit: ExposureLimit | null, decimals: number): number | null {
  if (!limit) return null;
  if (net < 0n) {
    const maxShort = toScaled(limit.maxShort, decimals);
    if (maxShort <= 0n) return null;
    return Number((-net * 10000n) / maxShort);
  }
  if (net > 0n) {
    const maxLong = toScaled(limit.maxLong, decimals);
    if (maxLong <= 0n) return null;
    return Number((net * 10000n) / maxLong);
  }
  return 0;
}
