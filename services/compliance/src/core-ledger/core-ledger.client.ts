import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';

/**
 * Freezing through the route that already exists.
 *
 * core-ledger's POST /wallets/:id/status and the ACCOUNT_FROZEN 409 it
 * produces are already handled by every service in this platform. A
 * compliance service that invented its own block list would be a second
 * answer to "can this party transact", and the first thing to go wrong would
 * be the two disagreeing.
 *
 * H2: every call carries compliance's own service-account token
 * (ledger.wallet-status) — core-ledger authenticates every call.
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

  async setWalletsStatus(partyId: string, status: 'ACTIVE' | 'FROZEN'): Promise<boolean> {
    try {
      const listed = await fetch(new URL(`/users/${encodeURIComponent(partyId)}/wallets`, this.baseUrl), {
        headers: await this.authHeaders(),
      });
      if (!listed.ok) return false;

      const body = (await listed.json()) as { wallets: Array<{ id: string }> };
      let allOk = true;
      for (const wallet of body.wallets) {
        const res = await fetch(new URL(`/wallets/${wallet.id}/status`, this.baseUrl), {
          method: 'POST',
          headers: {
            ...(await this.authHeaders()),
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ status }),
        });
        if (!res.ok) {
          this.logger.warn(`could not set ${wallet.id} to ${status}: core-ledger returned ${res.status}`);
          allOk = false;
        }
      }
      return allOk;
    } catch (err) {
      this.logger.error(
        `core-ledger unreachable setting wallets ${status} for ${partyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return false;
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      'X-User-Id': 'compliance',
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
  }
}
