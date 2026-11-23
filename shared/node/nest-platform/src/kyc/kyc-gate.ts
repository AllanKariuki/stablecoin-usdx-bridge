import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '../auth/service-token.client';
import { PlatformException } from '../errors/platform.exception';

/**
 * The KYC tier the receiver's internal endpoint reports.
 *
 * `tiers` is the full ordered list kyc returns, so a caller can resolve the
 * rank of the tier its deployment demands from the response itself — ranks
 * are kyc's data, and hardcoding them in every caller would make a tier
 * resequencing in one migration silently change what every other service
 * enforces.
 */
export interface KycTierResponse {
  partyId: string;
  tier: { name: string; rank: number };
  /** The party's open KYC case status, or null. */
  status: string | null;
  tiers: Array<{ name: string; rank: number }>;
}

/**
 * H5's money-path gate: no money moves for a party whose KYC tier is below
 * the configured minimum.
 *
 *   await gate.require(partyId, 'TIER_1');
 *
 * Fetches the party's tier from kyc's
 * `GET /internal/parties/:partyId/tier` with the caller's own service-account
 * token (audience `kyc`, role `kyc.tier-read`), resolves the minimum tier's
 * rank from the tiers list kyc returns, and throws
 *   - 403 KYC_REQUIRED        when the party's rank is below it;
 *   - 503 KYC_UNAVAILABLE     when kyc cannot be reached, answers non-2xx,
 *                             or does not name the minimum tier — the gate
 *                             fails CLOSED: an unreachable KYC service must
 *                             stop money, not wave it through.
 *
 * Nothing is cached. Tier revocation (a freeze, a downgrade) must bite on
 * the next request, and a cached "verified" answer on the money path is
 * exactly the window a revoked tier would slip through.
 *
 * KYC_URL is read from config; empty/unset behaves as unreachable (503).
 * The minimum tier is a call argument, not constructor config: payments and
 * bff each read their own env key (KYC_MIN_TIER_FIAT / KYC_MIN_TIER_ISSUANCE)
 * so this helper stays service-agnostic.
 */
@Injectable()
export class KycGate {
  private readonly logger = new Logger(KycGate.name);
  private readonly baseUrl: string;

  constructor(
    config: ConfigService,
    private readonly serviceTokens: ServiceTokenClient,
  ) {
    this.baseUrl = (config.get<string>('KYC_URL', { infer: true }) ?? '').replace(/\/$/, '');
  }

  async require(partyId: string, minimumTier: string): Promise<void> {
    let response: KycTierResponse;
    try {
      const res = await fetch(new URL(`/internal/parties/${encodeURIComponent(partyId)}/tier`, this.baseUrl), {
        headers: {
          Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
          // One call per movement, no hot loop: close rather than pool, so a
          // held-open socket cannot outlive a tier decision (or a test run).
          Connection: 'close',
        },
        signal: AbortSignal.timeout(5_000),
      });
      if (!res.ok) {
        this.logger.warn(`kyc answered ${res.status} for ${partyId}; refusing the movement`);
        throw new PlatformException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'KYC_UNAVAILABLE',
          `the KYC check could not be completed (kyc answered ${res.status})`,
        );
      }
      response = (await res.json()) as KycTierResponse;
    } catch (err) {
      if (err instanceof PlatformException) throw err;
      this.logger.error(
        `kyc unreachable checking ${partyId}: ${err instanceof Error ? err.message : String(err)}`,
      );
      throw new PlatformException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'KYC_UNAVAILABLE',
        'the KYC check could not be completed; no money moves while KYC is unreachable',
      );
    }

    const partyRank = Number(response?.tier?.rank ?? 0);
    const minimum = response?.tiers?.find((t) => t.name === minimumTier);
    if (!minimum) {
      // The deployment demands a tier kyc does not know about. That is a
      // configuration error, and a config error on the money path fails
      // closed — "the gate could not be evaluated" is not "the gate passed".
      this.logger.error(`kyc returned no tier named ${minimumTier}; refusing the movement`);
      throw new PlatformException(
        HttpStatus.SERVICE_UNAVAILABLE,
        'KYC_UNAVAILABLE',
        `the KYC check could not be completed (${minimumTier} is not a tier kyc defines)`,
      );
    }

    if (partyRank < minimum.rank) {
      throw new PlatformException(
        HttpStatus.FORBIDDEN,
        'KYC_REQUIRED',
        `verification tier ${minimumTier} required; current ${response.tier.name}`,
      );
    }
  }
}
