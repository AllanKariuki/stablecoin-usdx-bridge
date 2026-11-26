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
 * Since H6 the on-chain half of enforcement (BLACKLIST/UNBLACKLIST/PAUSE/
 * UNPAUSE) goes through core-ledger too — POST /chain/enforcement, the route
 * that holds the signer and the chain clients. It is durable and
 * asynchronous: the action id is the dedupe key on core-ledger's side, so a
 * retried call can never submit the transaction twice, and the FINAL/FAILED
 * outcome arrives later via core-ledger's outbox event (see the ingest
 * service), not from this response.
 *
 * H2: every call carries compliance's own service-account token
 * (ledger.wallet-status + ledger.enforcement) — core-ledger authenticates
 * every call.
 */

/** What a core-ledger enforcement submission came back with. */
export type EnforceOutcome =
  | { status: 'SUBMITTED'; txHash: string | null }
  | { status: 'FINAL'; txHash: string | null }
  | { status: 'FAILED'; reason: string }
  | { status: 'TERMINAL_FAILED'; reason: string }
  | { status: 'TRANSIENT'; reason: string };

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

  /**
   * Submits one approved enforcement action on chain through core-ledger.
   *
   * The outcomes the caller acts on:
   *  - SUBMITTED (202): the transaction was broadcast; core-ledger's worker
   *    is watching it and the FINAL/FAILED outcome arrives via the outbox
   *    event, not here.
   *  - FINAL / FAILED (200): this reference is already known to core-ledger
   *    and has reached its terminal state — a retried call's answer.
   *  - TERMINAL_FAILED (409): the submission was refused deterministically.
   *  - TRANSIENT (5xx / network): nothing was confirmed; retrying the same
   *    call is safe because core-ledger dedupes on the reference.
   */
  async enforce(input: {
    action: 'BLACKLIST' | 'UNBLACKLIST' | 'PAUSE' | 'UNPAUSE';
    chain: string;
    address?: string;
    reference: string;
  }): Promise<EnforceOutcome> {
    try {
      const res = await fetch(new URL('/chain/enforcement', this.baseUrl), {
        method: 'POST',
        headers: {
          ...(await this.authHeaders()),
          'Content-Type': 'application/json',
          // `enforcement:<action id>`: a retry of the same action replays the
          // first request's bytes instead of starting a second one.
          'Idempotency-Key': `enforcement:${input.reference}`,
        },
        body: JSON.stringify({
          action: input.action,
          chain: input.chain,
          address: input.address ?? '',
          reference: input.reference,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        status?: string;
        tx_hash?: string;
        failure_reason?: string;
        code?: string;
        error?: string;
      };
      const reason = body.error ?? body.failure_reason ?? `core-ledger returned ${res.status}`;

      if (res.ok) {
        // 200 = a terminal stored state; 202 = broadcast and being watched.
        if (body.status === 'FINAL') return { status: 'FINAL', txHash: body.tx_hash ?? null };
        if (body.status === 'FAILED') return { status: 'FAILED', reason };
        return { status: 'SUBMITTED', txHash: body.tx_hash ?? null };
      }
      if (res.status >= 500) {
        // CHAIN_UNAVAILABLE / AUDIT_WRITE_FAILED: an unknown outcome worth
        // retrying — core-ledger dedupes on the reference.
        this.logger.warn(`enforcement ${input.reference} ${input.action} failed transiently: ${reason}`);
        return { status: 'TRANSIENT', reason };
      }
      // 409 CHAIN_REJECTED (the chain reverted — retrying cannot change it),
      // 422 validation/authority refusals, and anything else the caller sent
      // wrong: all terminal.
      this.logger.error(`enforcement ${input.reference} ${input.action} was refused: ${reason}`);
      return { status: 'TERMINAL_FAILED', reason };
    } catch (err) {
      this.logger.warn(
        `core-ledger unreachable submitting enforcement ${input.reference}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return { status: 'TRANSIENT', reason: 'core-ledger unreachable' };
    }
  }

  private async authHeaders(): Promise<Record<string, string>> {
    return {
      'X-User-Id': 'compliance',
      Authorization: `Bearer ${await this.serviceTokens.accessToken()}`,
    };
  }
}
