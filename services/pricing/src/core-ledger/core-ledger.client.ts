import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';

/** The subset of core-ledger's POST /fx/quotes response pricing reads. */
export interface LedgerQuote {
  id: string;
  base_currency: string;
  quote_currency: string;
  rate: string;
  spread_bps: number;
  from_amount: string;
  party_id: string;
  expires_at: string;
}

/**
 * pricing's one outbound dependency.
 *
 * POST /fx/quotes is the seam this service writes through: the ledger keeps
 * the quote in its own table (so a conversion can be re-derived years
 * later), applies the spread itself, and enforces the amount/party pins
 * when the quote is consumed. Quote creation is locked to the ledger.pricing
 * role — held by svc-pricing and nothing else — so no other caller can mint
 * a rate; a conversion is only as honest as the quote it consumes.
 */
@Injectable()
export class CoreLedgerClient {
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
  }

  /**
   * Mints a quote in the ledger. `rate` is the pre-spread mid, a decimal
   * string at 18 fixed decimals ("1 base = rate quote"); the ledger applies
   * spread_bps on top and pins the quote to fromAmount/partyId, so exactly
   * one conversion — this party's, for this amount — can consume it.
   */
  async createQuote(input: {
    baseCcy: string;
    quoteCcy: string;
    rate: string;
    spreadBps: number;
    source: string;
    ttlSeconds: number;
    fromAmount: string;
    partyId: string;
  }): Promise<LedgerQuote> {
    const res = await fetch(new URL('/fx/quotes', this.baseUrl), {
      method: 'POST',
      headers: {
        ...(await this.headers()),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        base_currency: input.baseCcy,
        quote_currency: input.quoteCcy,
        rate: input.rate,
        spread_bps: input.spreadBps,
        source: input.source,
        ttl_seconds: input.ttlSeconds,
        from_amount: input.fromAmount,
        party_id: input.partyId,
      }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`core-ledger POST /fx/quotes returned ${res.status}: ${detail.slice(0, 500)}`);
    }
    return (await res.json()) as LedgerQuote;
  }

  private async headers(): Promise<Record<string, string>> {
    // X-User-Id names pricing for the ledger's journal; the bearer is
    // pricing's own service-account token (H2: core-ledger authenticates
    // every call and svc-pricing holds ledger.pricing).
    return {
      'X-User-Id': 'pricing',
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
  }
}
