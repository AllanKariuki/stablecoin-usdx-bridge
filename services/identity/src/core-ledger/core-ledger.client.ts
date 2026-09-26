import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * identity's only outbound call to core-ledger: ensure a party's default
 * fiat wallet exists (see docs/building-plan.md's P1 identity bullet:
 * "calls POST /wallets to create a party's default fiat wallet").
 * core-ledger's POST /wallets is idempotent (EnsureWallet, keyed on
 * user_id+currency+chain — core-ledger/internal/ledger/wallets.go), so
 * this is safe to call on every first provisioning, not just a literal
 * signup flow (there isn't a separate one — see ProvisioningService's
 * doc comment).
 */
@Injectable()
export class CoreLedgerClient {
  private readonly logger = new Logger(CoreLedgerClient.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.get<string>('CORE_LEDGER_URL', { infer: true })!;
  }

  /**
   * Best-effort by design: a core-ledger hiccup here must not fail party
   * resolution, which auth-proxy is blocked on synchronously for every
   * request that isn't already cached. bff's own WalletsService
   * (services/bff/src/wallets/wallets.service.ts) still calls this same
   * endpoint on every wallet list as an equally-idempotent safety net, so a
   * failure here is a missed optimization, not a lost wallet.
   */
  async ensureDefaultWallet(partyId: string): Promise<void> {
    try {
      const response = await fetch(new URL('/wallets', this.baseUrl), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: partyId, currency: 'USD', label: 'Main' }),
      });
      if (!response.ok) {
        this.logger.warn(`core-ledger POST /wallets returned ${response.status} for party ${partyId}`);
      }
    } catch (err) {
      this.logger.warn(
        `core-ledger unreachable while provisioning a default wallet for ${partyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
