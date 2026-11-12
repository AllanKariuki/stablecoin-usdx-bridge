import { BeforeApplicationShutdown, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { connect, Events, NatsConnection } from 'nats';

/**
 * The one NATS connection this service holds.
 *
 * Two things ride on it: LiveFanout's core pub/sub for cross-replica pushes,
 * and OutboxConsumer's durable JetStream consumer of core-ledger's outbox.
 * One connection rather than one each because they are the same broker, and
 * a second connection is a second reconnect loop to reason about.
 *
 * Unset `NATS_URL` means neither runs: pushes stay in-process and the outbox
 * arrives over HTTP at /internal/outbox, exactly as before NATS existed here.
 *
 * Boot never waits on the broker. notifications is also the email path, and
 * a NATS outage at deploy time must not stop it — so the first connection is
 * retried in the background and each user registers for it with `onConnect`.
 */
@Injectable()
export class NatsService implements OnModuleInit, BeforeApplicationShutdown {
  private readonly logger = new Logger(NatsService.name);
  readonly url: string;
  private nc: NatsConnection | null = null;
  /** Tracks reconnects: while false, callers fall back rather than buffer. */
  private connected = false;
  private stopped = false;
  private readonly listeners: Array<(nc: NatsConnection) => void> = [];
  private connectedOnce!: () => void;
  private readonly firstConnect = new Promise<void>((resolve) => (this.connectedOnce = resolve));

  constructor(config: ConfigService) {
    this.url = config.get<string>('NATS_URL', { infer: true }) ?? '';
  }

  onModuleInit(): void {
    if (!this.url) return;
    void this.connectLoop();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.close();
  }

  /** Whether NATS is configured at all. Unset is a supported state, not a fault. */
  get enabled(): boolean {
    return this.url !== '';
  }

  /** The live connection, or null while unconfigured, connecting or disconnected. */
  connection(): NatsConnection | null {
    return this.nc && this.connected ? this.nc : null;
  }

  /**
   * Runs `fn` once, with the first successful connection — immediately if
   * that has already happened. nats.js re-establishes subscriptions on
   * reconnect itself, so once is all a subscriber needs.
   */
  onConnect(fn: (nc: NatsConnection) => void): void {
    if (this.nc) fn(this.nc);
    else this.listeners.push(fn);
  }

  /** Resolves on the first successful connection. */
  whenConnected(): Promise<void> {
    return this.firstConnect;
  }

  async close(): Promise<void> {
    this.stopped = true;
    this.connected = false;
    // Drain so anything already handed to the connection — a push, an ack —
    // is flushed before the socket goes.
    await this.nc?.drain().catch(() => undefined);
    this.nc = null;
  }

  /**
   * Keeps trying until it connects once; after that nats.js owns reconnection.
   * A hand-rolled loop rather than `waitOnFirstConnect` because this one can
   * be stopped by shutdown.
   */
  private async connectLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const nc = await connect({
          servers: this.url,
          name: 'notifications',
          maxReconnectAttempts: -1,
          reconnectTimeWait: 2000,
        });
        if (this.stopped) {
          await nc.close();
          return;
        }
        this.nc = nc;
        this.connected = true;
        void this.watch(nc);
        for (const fn of this.listeners.splice(0)) fn(nc);
        this.connectedOnce();
        return;
      } catch (err) {
        this.logger.warn(
          `NATS unreachable at ${this.url}; retrying: ${err instanceof Error ? err.message : String(err)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 2000).unref());
      }
    }
  }

  private async watch(nc: NatsConnection): Promise<void> {
    for await (const status of nc.status()) {
      if (status.type === Events.Disconnect) {
        this.connected = false;
        this.logger.warn('NATS disconnected');
      } else if (status.type === Events.Reconnect) {
        this.connected = true;
        this.logger.log('NATS reconnected');
      }
    }
  }
}
