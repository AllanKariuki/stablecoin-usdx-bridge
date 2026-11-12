import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformMetricsService } from '@damp/nest-platform';
import { AckPolicy, ConsumerMessages, DeliverPolicy, JsMsg, NatsConnection, nanos } from 'nats';
import { Counter } from 'prom-client';
import { NatsService } from '../nats/nats.service';
import { OutboxHandler } from './outbox-handler';

/**
 * The subjects core-ledger's outbox publishes on, and the only ones this
 * consumer reads. Not `damp.>`: the DAMP stream captures every service's
 * domain events, and this consumer exists to receive core-ledger's — the
 * ledger's own (internal/ledger/events.go) and reconciliation's
 * (internal/reconciliation/sink.go).
 */
export const OUTBOX_SUBJECTS = ['damp.ledger.>', 'damp.reserves.>'];

/**
 * Consumes core-ledger's transactional outbox from JetStream.
 *
 * core-ledger's relay drains to one destination, chosen at boot
 * (outbox.Choose): JetStream when its NATS_URL is set, HTTP to
 * /internal/outbox otherwise — NATS wins when both are. docker-compose sets
 * the worker's NATS_URL, so without this consumer every ledger event,
 * reconciliation break alerts included, went into the DAMP stream and never
 * reached a human. Each message lands in OutboxHandler, the same path the
 * HTTP door uses, with the same `outbox:<row id>` dedupe key.
 *
 * **One durable, shared by every replica.** A pull consumer with a fixed
 * name: replicas pull from the same server-side cursor, so each message goes
 * to one of them and the work is split rather than duplicated. The cursor
 * lives on the server, so a restart resumes where the last ack left off.
 *
 * **Ack after, never before.** A message is acked only once OutboxHandler has
 * returned — the delivery rows are written and each send has an outcome.
 * A crash before that leaves the message unacked; JetStream redelivers it
 * after `ack_wait`, and the dedupe key (plus the PENDING lease, see
 * DeliveryService) makes the replay safe. A long send keeps the message with
 * `working()` rather than racing `ack_wait`.
 *
 * **Transient failure naks with backoff; poison is terminated.** The handler
 * throws only when the database is unreachable, which is transient: the
 * message is nak'd with a growing delay. After `OUTBOX_CONSUMER_MAX_DELIVERIES`
 * deliveries, or immediately for a message that cannot be parsed, it is
 * `term()`ed — logged at error with its stream sequence and counted in
 * `notifications_outbox_messages_total{outcome="terminated"}` — so one bad
 * message cannot pin a replica forever. The server's own max_deliver is left
 * unlimited on purpose: a server-side give-up is silent, and this one is not.
 *
 * **The stream is core-ledger's.** NewNATSPublisher creates DAMP
 * idempotently; this side never creates or alters it, only its own durable on
 * it. Starting before the stream exists is routine (notifications may boot
 * first), so a missing stream is waited for, not failed on.
 *
 * Unset `NATS_URL` means this never starts and /internal/outbox is the only
 * door, exactly as before. NATS is not a readiness check for the same reason
 * it isn't for LiveFanout: the HTTP door and email keep working without it.
 */
@Injectable()
export class OutboxConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxConsumer.name);
  private readonly stream: string;
  private readonly durable: string;
  private readonly maxDeliveries: number;
  private readonly ackWaitMs: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly retryMs: number;
  private readonly deliverNew: boolean;
  private readonly messagesTotal: Counter<'outcome'>;

  private stopped = false;
  private messages: ConsumerMessages | null = null;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;
  private readyOnce!: () => void;
  private readonly firstReady = new Promise<void>((resolve) => (this.readyOnce = resolve));

  constructor(
    private readonly nats: NatsService,
    private readonly handler: OutboxHandler,
    config: ConfigService,
    @Optional() metrics?: PlatformMetricsService,
  ) {
    const num = (key: string, fallback: number) => Number(config.get(key) ?? fallback);
    this.stream = config.get<string>('NATS_STREAM') || 'DAMP';
    this.durable = config.get<string>('OUTBOX_CONSUMER_DURABLE') || 'notifications-outbox';
    this.maxDeliveries = num('OUTBOX_CONSUMER_MAX_DELIVERIES', 10);
    this.ackWaitMs = num('OUTBOX_CONSUMER_ACK_WAIT_MS', 60_000);
    this.backoffBaseMs = num('OUTBOX_CONSUMER_BACKOFF_BASE_MS', 2_000);
    this.backoffMaxMs = num('OUTBOX_CONSUMER_BACKOFF_MAX_MS', 300_000);
    this.retryMs = num('OUTBOX_CONSUMER_RETRY_MS', 2_000);
    this.deliverNew = config.get<string>('OUTBOX_CONSUMER_DELIVER_POLICY') === 'new';

    this.messagesTotal = new Counter({
      name: 'notifications_outbox_messages_total',
      help: 'core-ledger outbox messages consumed from JetStream, by outcome (handled, retried, terminated).',
      labelNames: ['outcome'],
      // A private registry when there is no platform one (tests), so the
      // counter still works without colliding in prom-client's global.
      registers: metrics ? [metrics.registry] : [],
    });
  }

  /** After bootstrap, not module init: handling writes tables a migration creates. */
  onApplicationBootstrap(): void {
    if (!this.nats.enabled) {
      this.logger.log('NATS_URL is unset; core-ledger outbox events arrive over HTTP at /internal/outbox only');
      return;
    }
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    // Stops pulling; the message in hand finishes (and is acked) first,
    // because the loop awaits it before reading the next.
    await this.messages?.close().catch(() => undefined);
    await this.loop;
  }

  /** Resolves once the durable exists and messages are being pulled. For tests. */
  whenReady(): Promise<void> {
    return this.firstReady;
  }

  /** The counter, so tests can read outcomes without a registry. */
  get metrics(): Counter<'outcome'> {
    return this.messagesTotal;
  }

  private async run(): Promise<void> {
    await Promise.race([this.nats.whenConnected(), new Promise<void>((resolve) => (this.wake = resolve))]);

    let waitingForStream = false;
    while (!this.stopped) {
      const nc = this.nats.connection();
      if (nc) {
        try {
          await this.ensureConsumer(nc);
          if (waitingForStream) this.logger.log(`stream ${this.stream} is up`);
          waitingForStream = false;
          await this.consume(nc);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          if (/stream not found/i.test(message)) {
            // core-ledger owns the stream and creates it when its relay first
            // connects. Until then there is nothing to consume; say so once.
            if (!waitingForStream) {
              this.logger.log(`stream ${this.stream} does not exist yet; waiting for core-ledger's relay to create it`);
            }
            waitingForStream = true;
          } else {
            this.logger.warn(`outbox consumer interrupted, restarting: ${message}`);
          }
        }
      }
      if (!this.stopped) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          setTimeout(resolve, this.retryMs).unref();
        });
      }
    }
    this.logger.log('outbox consumer stopped');
  }

  /**
   * Creates the durable, or confirms it — the server's create-or-update is
   * idempotent for an unchanged config, so every replica can call this on
   * every boot.
   *
   * The deliver policy applies only the first time the durable is created;
   * after that its cursor is the server's. `all` by default because the
   * events this fixes are the ones already sitting in the stream: on its
   * first boot, notifications receives what was published while nothing
   * consumed it, and anything the HTTP door already delivered is dropped by
   * the shared dedupe key. `new` is for an environment where up to 30 days of
   * backlog would be noise rather than news.
   */
  private async ensureConsumer(nc: NatsConnection): Promise<void> {
    const jsm = await nc.jetstreamManager();
    await jsm.consumers.add(this.stream, {
      durable_name: this.durable,
      ack_policy: AckPolicy.Explicit,
      deliver_policy: this.deliverNew ? DeliverPolicy.New : DeliverPolicy.All,
      filter_subjects: OUTBOX_SUBJECTS,
      ack_wait: nanos(this.ackWaitMs),
      max_deliver: -1,
      max_ack_pending: 256,
    });
  }

  private async consume(nc: NatsConnection): Promise<void> {
    const consumer = await nc.jetstream().consumers.get(this.stream, this.durable);
    const messages = await consumer.consume({ max_messages: 16 });
    this.messages = messages;
    void this.watch(messages);
    this.logger.log(`consuming core-ledger's outbox from JetStream (stream ${this.stream}, durable ${this.durable})`);
    this.readyOnce();
    try {
      for await (const m of messages) {
        await this.process(m);
      }
    } finally {
      this.messages = null;
    }
  }

  /**
   * The stream or durable vanishing mid-consume (a stream recreated, a
   * consumer deleted by hand) does not end the iterator on its own; stopping
   * it sends the loop back through ensureConsumer.
   */
  private async watch(messages: ConsumerMessages): Promise<void> {
    for await (const s of await messages.status()) {
      if (s.type === 'stream_not_found' || s.type === 'consumer_not_found' || s.type === 'consumer_deleted') {
        this.logger.warn(`outbox consumer: ${s.type}; re-establishing`);
        messages.stop();
        return;
      }
    }
  }

  private async process(m: JsMsg): Promise<void> {
    const delivery = m.info.deliveryCount;
    const eventType = m.headers?.get('X-Event-Type') || m.subject;
    const eventId = eventIdOf(m.headers?.get('Nats-Msg-Id') ?? '', eventType);

    if (delivery > this.maxDeliveries) {
      // Checked before handling, so a message that kills the process on every
      // attempt — and therefore never reaches the catch below — still ends.
      this.terminate(m, eventType, eventId, `exceeded ${this.maxDeliveries} deliveries`);
      return;
    }
    if (!eventId) {
      // core-ledger's relay always sets Nats-Msg-Id to <type>:<row id>. A
      // message without it was published by something else and cannot be
      // deduped, so it is not delivered at all rather than delivered unsafely.
      this.terminate(m, eventType, eventId, 'no Nats-Msg-Id of the form <event_type>:<outbox id>');
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(m.data));
    } catch {
      payload = undefined;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      this.terminate(m, eventType, eventId, 'payload is not a JSON object');
      return;
    }

    // Tells the server this message is still being worked on, so a slow SMTP
    // server does not make ack_wait hand it to another replica mid-send.
    const keepAlive = setInterval(() => m.working(), Math.max(1000, this.ackWaitMs / 3));
    try {
      await this.handler.handle(eventType, eventId, payload as Record<string, unknown>);
      m.ack();
      this.messagesTotal.inc({ outcome: 'handled' });
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (delivery >= this.maxDeliveries) {
        this.terminate(m, eventType, eventId, `failed on its last delivery: ${reason}`);
        return;
      }
      const delay = Math.min(this.backoffBaseMs * 2 ** (delivery - 1), this.backoffMaxMs);
      m.nak(delay);
      this.messagesTotal.inc({ outcome: 'retried' });
      this.logger.warn(
        `${eventType} (outbox ${eventId}) failed on delivery ${delivery}/${this.maxDeliveries}, retrying in ${delay}ms: ${reason}`,
      );
    } finally {
      clearInterval(keepAlive);
    }
  }

  private terminate(m: JsMsg, eventType: string, eventId: string, reason: string): void {
    m.term(reason);
    this.messagesTotal.inc({ outcome: 'terminated' });
    // Error, with the stream sequence: this is an event the platform produced
    // and nobody was told about, and the sequence is how an operator finds it
    // (`nats stream get DAMP <seq>`) to replay by hand.
    this.logger.error(
      `terminated ${eventType} (outbox ${eventId || '?'}, stream seq ${m.seq}) after ${m.info.deliveryCount} deliveries: ${reason}`,
    );
  }
}

/**
 * core-ledger's relay sets Nats-Msg-Id to `<event_type>:<outbox row id>`
 * (outbox/nats.go). The row id is what the HTTP door receives as X-Event-Id,
 * so it is the half used for the dedupe key.
 */
export function eventIdOf(msgId: string, eventType: string): string {
  const id = msgId.startsWith(`${eventType}:`) ? msgId.slice(eventType.length + 1) : msgId.slice(msgId.lastIndexOf(':') + 1);
  return /^\d+$/.test(id) ? id : '';
}
