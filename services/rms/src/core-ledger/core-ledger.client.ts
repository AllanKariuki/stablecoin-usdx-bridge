import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';
import { Money, toMoney } from '../money/money';

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
    // rms holds ledger.reserves.custodian).
    return {
      'X-User-Id': 'rms',
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
  }
}
