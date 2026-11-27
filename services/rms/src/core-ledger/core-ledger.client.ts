import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { ServiceTokenClient } from '@damp/nest-platform';
import { isCustodialCrypto, Money, toMoney } from '../money/money';

/** The subset of core-ledger's GET /reserves/status that rms reads. */
export interface ReserveStatus {
  issued: string;
  in_transit: string;
  backing: string;
  ledger_cash: string;
  currency: string;
  chains: Record<string, { total_supply: string | null; height: number | null; captured_at: string | null }>;
  custodian: { balance: string; as_of: string; age_seconds: number } | null;
  open_breaks: Array<{ id: string; leg: string; code: string; detail: string; drift: string; opened_at: string }>;
  last_run: { id: string; status: string; started_at: string } | null;
}

/** One currency's row of core-ledger's GET /treasury/positions. */
export interface TreasuryPosition {
  currency: string;
  decimals: number;
  customer_liabilities: string;
  custody_holdings: string;
  fx_position: string;
  net_exposure: string;
}

/**
 * rms's one outbound dependency.
 *
 * It reads the ledger's cash position (which is what the stub custodian
 * reports against) and writes custodian snapshots back. The write is the
 * important direction: POST /reserves/custodian-snapshots is the writer
 * trust_bank_snapshot has never had, and without it reconciliation's Leg C
 * is skipped on every run — which is R7, "the one control catching an
 * unbacked mint is decorative".
 */
@Injectable()
export class CoreLedgerClient {
  private readonly logger = new Logger(CoreLedgerClient.name);
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
  }

  async reserveStatus(): Promise<ReserveStatus> {
    const res = await fetch(new URL('/reserves/status', this.baseUrl), { headers: await this.headers() });
    if (!res.ok) {
      throw new Error(`core-ledger GET /reserves/status returned ${res.status}`);
    }
    return (await res.json()) as ReserveStatus;
  }

  /** The ledger's own view of cash at custodian, which the stub reports against. */
  async ledgerCash(currency: string): Promise<Money> {
    const status = await this.reserveStatus();
    if (status.currency !== currency) {
      // The ledger reports its peg currency; a custodian in another one has
      // no ledger-derived baseline and the stub must not silently use the
      // wrong currency's number.
      this.logger.warn(`no ledger cash figure for ${currency}; core-ledger reports ${status.currency}`);
      return toMoney('0', currency);
    }
    return toMoney(status.ledger_cash, currency);
  }

  /** The house's treasury positions, one row per custodial crypto currency. */
  async treasuryPositions(): Promise<TreasuryPosition[]> {
    const res = await fetch(new URL('/treasury/positions', this.baseUrl), { headers: await this.headers() });
    if (!res.ok) {
      throw new Error(`core-ledger GET /treasury/positions returned ${res.status}`);
    }
    const body = (await res.json()) as { positions: TreasuryPosition[] };
    return body.positions;
  }

  /** The ledger's crypto-at-custodian balance, the stub's baseline for crypto. */
  async custodyHoldings(currency: string): Promise<Money> {
    const positions = await this.treasuryPositions();
    const position = positions.find((p) => p.currency === currency);
    if (!position) {
      // The ledger reports a row for every active custodial crypto currency;
      // a missing one means the chart was seeded without this currency, and
      // the stub must say zero rather than quietly answer in another one's.
      this.logger.warn(`no ledger custody figure for ${currency}; core-ledger reports no ${currency} position`);
      return toMoney('0', currency);
    }
    return toMoney(position.custody_holdings, currency);
  }

  /**
   * The ledger-derived baseline a stub custodian reports against, chosen by
   * the currency's kind: cash at custodian for fiat, custody holdings for
   * custodial crypto — both are "what the ledger says the custodian holds".
   */
  async stubBaseline(currency: string): Promise<Money> {
    if (isCustodialCrypto(currency)) return this.custodyHoldings(currency);
    return this.ledgerCash(currency);
  }

  /**
   * Posts one treasury desk trade to core-ledger's rebalance journal.
   *
   * The Idempotency-Key is derived from the trade's own content rather than
   * generated, so a retry of the same trade replays the first call instead
   * of posting a second journal — the same reasoning as
   * postCustodianSnapshot's (custodian, currency, as_of) key. The note is
   * deliberately out of the digest: it is a comment, not part of the trade.
   */
  async postTreasuryRebalance(input: {
    side: 'BUY' | 'SELL';
    currency: string;
    amount: string;
    fiatCurrency: string;
    fiatAmount: string;
    custodianRef: string;
    note: string;
  }): Promise<{ id: string }> {
    const key = rebalanceIdempotencyKey(input);
    const res = await fetch(new URL('/treasury/rebalances', this.baseUrl), {
      method: 'POST',
      headers: {
        ...(await this.headers()),
        'Content-Type': 'application/json',
        'Idempotency-Key': key,
      },
      body: JSON.stringify({
        side: input.side,
        currency: input.currency,
        amount: input.amount,
        fiat_currency: input.fiatCurrency,
        fiat_amount: input.fiatAmount,
        custodian_ref: input.custodianRef,
        note: input.note,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`core-ledger POST /treasury/rebalances returned ${res.status}: ${detail.slice(0, 500)}`);
    }
    return (await res.json()) as { id: string };
  }

  /**
   * Records what a custodian reported.
   *
   * The Idempotency-Key is derived from (custodian, currency, as_of) rather
   * than generated, so the retry a failed post produces replays the first
   * call instead of writing a second snapshot at a second timestamp —
   * which would make a custodian look like it reported twice.
   */
  async postCustodianSnapshot(input: {
    custodianId: string;
    currency: string;
    balance: string;
    asOf: Date;
    statementRef: string;
  }): Promise<void> {
    const res = await fetch(new URL('/reserves/custodian-snapshots', this.baseUrl), {
      method: 'POST',
      headers: {
        ...(await this.headers()),
        'Content-Type': 'application/json',
        'Idempotency-Key': `custodian:${input.custodianId}:${input.currency}:${input.asOf.toISOString()}`,
      },
      body: JSON.stringify({
        custodian_id: input.custodianId,
        currency: input.currency,
        balance: input.balance,
        as_of: input.asOf.toISOString(),
        source: 'rms',
        statement_ref: input.statementRef,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`core-ledger POST /reserves/custodian-snapshots returned ${res.status}: ${detail.slice(0, 500)}`);
    }
  }

  private async headers(): Promise<Record<string, string>> {
    // X-User-Id names rms for the journal; the bearer is rms' own
    // service-account token (H2: core-ledger authenticates every call and
    // rms holds ledger.reserves.custodian + ledger.treasury).
    return {
      'X-User-Id': 'rms',
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
  }
}

/**
 * The deterministic Idempotency-Key for one treasury trade: a digest of
 * everything that makes the trade itself, so the ledger replays rather than
 * double-posts. Exported for the unit tests that assert the key is stable.
 */
export function rebalanceIdempotencyKey(input: {
  side: 'BUY' | 'SELL';
  currency: string;
  amount: string;
  fiatCurrency: string;
  fiatAmount: string;
  custodianRef: string;
}): string {
  const canonical = [
    input.side,
    input.currency,
    input.amount,
    input.fiatCurrency,
    input.fiatAmount,
    input.custodianRef,
  ].join(':');
  return `rms-rebalance:${createHash('sha256').update(canonical).digest('hex')}`;
}
