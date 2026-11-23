import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ServiceTokenClient } from '@damp/nest-platform';

/**
 * kyc's one write to core-ledger: freezing and unfreezing wallets.
 *
 * It uses `POST /wallets/:id/status` — the route that already exists and
 * whose `ACCOUNT_FROZEN` 409 every service in this platform already handles.
 * A KYC service that invented its own "can this party transact" check would
 * be a second gate with a second answer, and the first thing to go wrong
 * would be the two disagreeing.
 *
 * H2: every call carries kyc's own service-account token (ledger.wallet-
 * status) — core-ledger authenticates every call and checks the role.
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

  async setWalletsActive(partyId: string): Promise<void> {
    return this.setWalletsStatus(partyId, 'ACTIVE');
  }

  async setWalletsFrozen(partyId: string): Promise<void> {
    return this.setWalletsStatus(partyId, 'FROZEN');
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      'X-User-Id': 'kyc',
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
  }

  private async setWalletsStatus(partyId: string, status: 'ACTIVE' | 'FROZEN'): Promise<void> {
    try {
      const listed = await fetch(new URL(`/users/${encodeURIComponent(partyId)}/wallets`, this.baseUrl), {
        headers: await this.authHeaders(),
      });
      if (!listed.ok) {
        this.logger.warn(`core-ledger returned ${listed.status} listing wallets for ${partyId}`);
        return;
      }
      const body = (await listed.json()) as { wallets: Array<{ id: string; status: string }> };

      for (const wallet of body.wallets) {
        // Never thaws a wallet a *compliance* freeze put on hold. This
        // service only knows about the KYC reason for a freeze, and an
        // approved KYC case must not quietly undo a sanctions hold that
        // services/compliance applied for an entirely different reason.
        if (status === 'ACTIVE' && wallet.status === 'CLOSED') continue;

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
        }
      }
    } catch (err) {
      this.logger.error(
        `core-ledger unreachable setting wallets ${status} for ${partyId}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
    }
  }
}
