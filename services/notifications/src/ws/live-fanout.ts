import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Events, JSONCodec, NatsConnection } from 'nats';
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
 */
@Injectable()
export class LiveFanout implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveFanout.name);
  private readonly url: string;
  private nc: NatsConnection | null = null;
  /** Tracks reconnects: while false, pushes are delivered locally rather than buffered. */
  private connected = false;
  private stopped = false;
  private connectedOnce!: () => void;
  private readonly firstConnect = new Promise<void>((resolve) => (this.connectedOnce = resolve));

  constructor(
    config: ConfigService,
    private readonly ws: WsGateway,
  ) {
    this.url = config.get<string>('NATS_URL', { infer: true }) ?? '';
  }

  onModuleInit(): void {
    if (!this.url) {
      this.logger.log('NATS_URL is unset; live pushes reach this replica\'s sockets only (fine for one replica)');
      return;
    }
    // Not awaited. Boot must not wait on the broker: notifications is also
    // the email path, and a NATS outage at deploy time shouldn't stop it.
    void this.connectLoop();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    // Drain so a push already handed to the connection is flushed before the
    // socket goes.
    await this.nc?.drain().catch(() => undefined);
    this.nc = null;
  }

  /**
   * Sends a push. Returns how many local sockets received it on the
   * in-process path, or `null` when it was handed to NATS — how many sockets
   * on other replicas received it is not observable from here.
   */
  push(partyId: string, type: string, payload: unknown): number | null {
    if (this.nc && this.connected) {
      try {
        this.nc.publish(LIVE_PUSH_SUBJECT, codec.encode({ partyId, type, payload }));
        return null;
      } catch (err) {
        this.logger.warn(`NATS publish failed, delivering locally: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    return this.deliverLocal({ partyId, type, payload });
  }

  /** Whether pushes are currently crossing replicas. */
  isFannedOut(): boolean {
    return this.nc !== null && this.connected;
  }

  /** Resolves on the first successful connection. For tests and nothing else. */
  whenConnected(): Promise<void> {
    return this.firstConnect;
  }

  private deliverLocal(push: LivePush): number {
    return push.partyId
      ? this.ws.broadcast(push.partyId, push.type, push.payload)
      : this.ws.broadcastAll(push.type, push.payload);
  }

  /**
   * Keeps trying until it connects once; after that nats.js owns reconnection
   * (and re-subscribes on its own). A hand-rolled loop rather than
   * `waitOnFirstConnect` because this one can be stopped by shutdown.
   */
  private async connectLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const nc = await connect({
          servers: this.url,
          name: 'notifications-live-fanout',
          maxReconnectAttempts: -1,
          reconnectTimeWait: 2000,
        });
        if (this.stopped) {
          await nc.close();
          return;
        }
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
        this.nc = nc;
        this.connected = true;
        void this.watch(nc);
        this.logger.log(`live pushes fan out across replicas via NATS (${LIVE_PUSH_SUBJECT})`);
        this.connectedOnce();
        return;
      } catch (err) {
        this.logger.warn(
          `NATS unreachable at ${this.url}; live pushes stay on this replica until it is: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000).unref());
      }
    }
  }

  private async watch(nc: NatsConnection): Promise<void> {
    for await (const status of nc.status()) {
      if (status.type === Events.Disconnect) {
        this.connected = false;
        this.logger.warn('NATS disconnected; live pushes stay on this replica until it reconnects');
      } else if (status.type === Events.Reconnect) {
        this.connected = true;
        this.logger.log('NATS reconnected; live pushes fan out again');
      }
    }
  }
}
