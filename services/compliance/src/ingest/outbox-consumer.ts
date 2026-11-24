import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AckPolicy, ConsumerMessages, DeliverPolicy, JsMsg, JetStreamManager, NatsConnection, nanos } from 'nats';
import { IngestService } from './ingest.service';

/**
 * The one subject this consumer reads: core-ledger's chain_enforcement
 * finality event, the async half of H6. Narrowed deliberately — the DAMP
 * stream carries every service's events, and this consumer exists for the
 * enforcement outcome only.
 */
export const ENFORCEMENT_SUBJECT = 'damp.ledger.chain_enforcement_finalized.v1';

/**
 * Consumes the enforcement finality event from JetStream.
 *
 * core-ledger's relay drains its outbox to one destination chosen at boot
 * (NATS when its NATS_URL is set, HTTP to /internal/outbox otherwise). The
 * local stack runs NATS, so without this consumer a finalized enforcement
 * transaction would sit in the stream and the compliance action would stay
 * SUBMITTED forever. Both doors — NATS and the HTTP controller — route into
 * the same IngestService, and the action's status is the dedupe on either
 * path: a redelivered event finds the action already EXECUTED/FAILED and
 * changes nothing.
 *
 * One durable, shared by every replica, so the work is split rather than
 * duplicated. Ack after the handler returns; a crash before that redelivers
 * after ack_wait. A message that cannot be parsed is term()ed so one bad
 * message cannot pin a replica.
 *
 * Unset NATS_URL means this never starts and /internal/outbox is the only
 * door, exactly as before.
 */
@Injectable()
export class OutboxConsumer implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(OutboxConsumer.name);
  private readonly url: string;
  private readonly stream: string;
  private readonly durable: string;
  private readonly maxDeliveries: number;
  private readonly ackWaitMs: number;
  private readonly retryMs: number;

  private nc: NatsConnection | null = null;
  private stopped = false;
  private messages: ConsumerMessages | null = null;
  private loop: Promise<void> | null = null;
  private wake: (() => void) | null = null;

  constructor(
    private readonly ingest: IngestService,
    config: ConfigService,
  ) {
    this.url = config.get<string>('NATS_URL', { infer: true }) ?? '';
    this.stream = config.get<string>('NATS_STREAM', { infer: true }) ?? 'DAMP';
    this.durable = config.get<string>('ENFORCEMENT_CONSUMER_DURABLE', { infer: true }) ?? 'compliance-enforcement';
    this.maxDeliveries = Number(config.get('ENFORCEMENT_CONSUMER_MAX_DELIVERIES', { infer: true }) ?? 10);
    this.ackWaitMs = Number(config.get('ENFORCEMENT_CONSUMER_ACK_WAIT_MS', { infer: true }) ?? 60_000);
    this.retryMs = Number(config.get('ENFORCEMENT_CONSUMER_RETRY_MS', { infer: true }) ?? 2_000);
  }

  get enabled(): boolean {
    return this.url !== '';
  }

  onApplicationBootstrap(): void {
    if (!this.enabled) {
      this.logger.log('NATS_URL is unset; core-ledger outbox events arrive over HTTP at /internal/outbox only');
      return;
    }
    this.loop = this.run();
  }

  async onModuleDestroy(): Promise<void> {
    this.stopped = true;
    this.wake?.();
    await this.messages?.close().catch(() => undefined);
    await this.nc?.drain().catch(() => undefined);
    await this.loop;
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      if (!this.nc || this.nc.isClosed()) {
        await this.connect();
        // Reconnect storms are fine: the outbox is durable, and this side
        // only misses time, never events.
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          setTimeout(resolve, this.retryMs).unref();
        });
        continue;
      }
      try {
        await this.ensureConsumer(this.nc);
        await this.consume(this.nc);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (/stream not found/i.test(message)) {
          // core-ledger owns the stream and creates it when its relay first
          // connects. Until then there is nothing to consume.
          this.logger.log(`stream ${this.stream} does not exist yet; waiting for core-ledger's relay to create it`);
        } else {
          this.logger.warn(`enforcement outbox consumer interrupted, restarting: ${message}`);
        }
      }
      if (!this.stopped) {
        await new Promise<void>((resolve) => {
          this.wake = resolve;
          setTimeout(resolve, this.retryMs).unref();
        });
      }
    }
    this.logger.log('enforcement outbox consumer stopped');
  }

  private async connect(): Promise<void> {
    const { connect } = await import('nats');
    this.nc = await connect({
      servers: [this.url],
      name: 'compliance-enforcement-consumer',
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2_000,
    });
  }

  /** Creates the durable, or confirms it — idempotent, so every replica may call it. */
  private async ensureConsumer(nc: NatsConnection): Promise<void> {
    const jsm: JetStreamManager = await nc.jetstreamManager();
    await jsm.consumers.add(this.stream, {
      durable_name: this.durable,
      ack_policy: AckPolicy.Explicit,
      // All, not New: with New, an enforcement that finalized before this
      // durable first existed (compliance deploying after core-ledger, or the
      // consumer misconfigured for a while) would be skipped forever and its
      // action stuck at SUBMITTED. The filter keeps the backlog to enforcement
      // events only, and applyChainOutcome is idempotent, so a replay is safe.
      // Once the durable exists it resumes from its own cursor.
      deliver_policy: DeliverPolicy.All,
      filter_subjects: [ENFORCEMENT_SUBJECT],
      ack_wait: nanos(this.ackWaitMs),
      max_deliver: -1,
      max_ack_pending: 64,
    });
  }

  private async consume(nc: NatsConnection): Promise<void> {
    const consumer = await nc.jetstream().consumers.get(this.stream, this.durable);
    const messages = await consumer.consume({ max_messages: 16 });
    this.messages = messages;
    this.logger.log(`consuming core-ledger's enforcement finality events (stream ${this.stream}, durable ${this.durable})`);
    try {
      for await (const m of messages) {
        await this.process(m);
      }
    } finally {
      this.messages = null;
    }
  }

  private async process(m: JsMsg): Promise<void> {
    const delivery = m.info.deliveryCount;
    const eventType = m.headers?.get('X-Event-Type') || m.subject;

    if (delivery > this.maxDeliveries) {
      m.term(`exceeded ${this.maxDeliveries} deliveries`);
      this.logger.error(`terminated ${eventType} (stream seq ${m.seq}) after ${delivery} deliveries`);
      return;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(new TextDecoder().decode(m.data));
    } catch {
      payload = undefined;
    }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      m.term('payload is not a JSON object');
      this.logger.error(`terminated ${eventType} (stream seq ${m.seq}): payload is not a JSON object`);
      return;
    }

    try {
      await this.ingest.onEnforcementFinalized(payload as Record<string, unknown>);
      m.ack();
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      if (delivery >= this.maxDeliveries) {
        m.term(`failed on its last delivery: ${reason}`);
        this.logger.error(`terminated ${eventType} (stream seq ${m.seq}): ${reason}`);
        return;
      }
      const delay = Math.min(2_000 * 2 ** (delivery - 1), 300_000);
      m.nak(delay);
      this.logger.warn(`${eventType} (stream seq ${m.seq}) failed on delivery ${delivery}/${this.maxDeliveries}, retrying in ${delay}ms: ${reason}`);
    }
  }
}
