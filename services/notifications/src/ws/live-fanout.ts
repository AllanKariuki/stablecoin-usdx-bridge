import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { JSONCodec } from 'nats';
import { NatsService } from '../nats/nats.service';
import { WsGateway } from './ws.gateway';

/**
 * The subject every replica publishes live pushes to and subscribes to.
 *
 * Deliberately *outside* `damp.>`. core-ledger's relay creates the DAMP
 * JetStream stream over `damp.>` with 30-day file retention, and JetStream
 * captures plain publishes to any subject a stream covers — so a push sent as
 * `damp.notifications.…` would be persisted, rendered message body and all,
 * for a month. A live push is a latency optimisation over the `deliveries`
 * table, not a domain event, and has no business in the platform's event log.
 */
export const LIVE_PUSH_SUBJECT = 'live.notifications.push.v1';

interface LivePush {
  /** Empty means every connected socket — an operator broadcast. */
  partyId: string;
  type: string;
  payload: unknown;
}

const codec = JSONCodec<LivePush>();

/**
 * Gets a live push to the sockets that should see it, whichever replica holds
 * them.
 *
 * WsGateway only knows the sockets connected to this process, so with two
 * replicas a customer on A used to miss a push produced on B. With `NATS_URL`
 * set, every push is published on core NATS (not JetStream — see the subject)
 * and every replica, the publisher included, delivers it to its own sockets
 * from its subscription. Plain pub/sub rather than a queue group is the
 * point: each replica must receive every message, because any of them may
 * hold the socket.
 *
 * Unset `NATS_URL` keeps the in-process path exactly as it was, which is all
 * a single replica needs — local development doesn't have to run a broker to
 * see a toast.
 *
 * NATS being unreachable degrades to that same in-process path rather than
 * failing: the socket was never the durable channel (every notification is in
 * `deliveries` first, and the client re-fetches on reconnect), so a broker
 * outage should cost cross-replica latency and nothing else. For the same
 * reason NATS is not a readiness check — taking notifications out of rotation
 * because of it would stop emails over a degraded toast.
 *
 * The connection itself is NatsService's, shared with OutboxConsumer.
 */
@Injectable()
export class LiveFanout implements OnModuleInit {
  private readonly logger = new Logger(LiveFanout.name);

  constructor(
    private readonly nats: NatsService,
    private readonly ws: WsGateway,
  ) {}

  onModuleInit(): void {
    if (!this.nats.enabled) {
      this.logger.log('NATS_URL is unset; live pushes reach this replica\'s sockets only (fine for one replica)');
      return;
    }
    this.nats.onConnect((nc) => {
      // nats.js re-subscribes on reconnect, so one subscription for the life
      // of the connection is enough.
      nc.subscribe(LIVE_PUSH_SUBJECT, {
        callback: (err, msg) => {
          if (err) return;
          let push: LivePush;
          try {
            push = codec.decode(msg.data);
          } catch {
            return;
          }
          if (typeof push?.type !== 'string' || typeof push.partyId !== 'string') return;
          this.deliverLocal(push);
        },
      });
      this.logger.log(`live pushes fan out across replicas via NATS (${LIVE_PUSH_SUBJECT})`);
    });
  }

  /**
   * Sends a push. Returns how many local sockets received it on the
   * in-process path, or `null` when it was handed to NATS — how many sockets
   * on other replicas received it is not observable from here.
   */
  push(partyId: string, type: string, payload: unknown): number | null {
    const nc = this.nats.connection();
    if (nc) {
      try {
        nc.publish(LIVE_PUSH_SUBJECT, codec.encode({ partyId, type, payload }));
        return null;
      } catch (err) {
        this.logger.warn(`NATS publish failed, delivering locally: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return this.deliverLocal({ partyId, type, payload });
  }

  /** Whether pushes are currently crossing replicas. */
  isFannedOut(): boolean {
    return this.nats.connection() !== null;
  }

  /** Resolves on the first successful connection. For tests and nothing else. */
  whenConnected(): Promise<void> {
    return this.nats.whenConnected();
  }

  private deliverLocal(push: LivePush): number {
    return push.partyId
      ? this.ws.broadcast(push.partyId, push.type, push.payload)
      : this.ws.broadcastAll(push.type, push.payload);
  }
}
