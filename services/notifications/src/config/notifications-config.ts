import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export class NotificationsConfig {
  /**
   * 3000, not a port of this service's choosing.
   *
   * frontend/public/runtime-config.js declares
   * VITE_APP_WEBSOCKET_URL = ws://localhost:3000/ws, and the frontend was
   * written against it before this service existed. That is also why Grafana
   * sits on 53000 — see the plan's port map, where 3000 is reserved for
   * exactly this.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  /**
   * Keycloak's realm issuer, for verifying the token on a WebSocket upgrade.
   *
   * The upgrade cannot go through Traefik's ForwardAuth the way an HTTP
   * request does — a browser cannot set headers on `new WebSocket()` — so the
   * token arrives as a query parameter and is verified here. Empty disables
   * verification, which is only acceptable in local development and is logged
   * loudly at boot.
   */
  @IsOptional()
  @IsString()
  KEYCLOAK_ISSUER_URL = '';

  /**
   * Where to fetch the signing keys, when that differs from the issuer. The
   * issuer is compared against the token's `iss`, so it must be the URL the
   * *browser* reached Keycloak on (http://localhost:8080/...) — but inside a
   * container that address is the container itself. Empty derives the keys
   * URL from the issuer, which is right whenever the two agree.
   */
  @IsOptional()
  @IsString()
  KEYCLOAK_JWKS_URL = '';

  @IsString()
  OIDC_AUDIENCE = 'damp-portal';

  /**
   * identity, to map a Keycloak subject to the party id every other service
   * uses. Without it the subject is passed through — the same fallback
   * auth-proxy shipped with.
   */
  @IsOptional()
  @IsString()
  IDENTITY_SERVICE_URL = '';

  // --- SMTP. Mailpit locally: :58025 web UI, 1025 SMTP. ---
  @IsOptional()
  @IsString()
  SMTP_HOST = '';

  @Type(() => Number)
  @IsInt()
  SMTP_PORT = 1025;

  @Type(() => Boolean)
  @IsBoolean()
  SMTP_SECURE = false;

  @IsOptional()
  @IsString()
  SMTP_USER = '';

  @IsOptional()
  @IsString()
  SMTP_PASSWORD = '';

  @IsString()
  SMTP_FROM = 'DAMP <no-reply@damp.local>';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  WEBHOOK_DRAIN_SECONDS = 10;

  /**
   * NATS, for two things on one connection (see NatsService): fanning live
   * WebSocket pushes out to every replica (LiveFanout), and consuming
   * core-ledger's outbox from JetStream (OutboxConsumer). Empty keeps pushes
   * in-process and leaves /internal/outbox as the only way ledger events
   * arrive — which is right only while core-ledger's worker relays over HTTP
   * too. If its NATS_URL is set, this must be as well, or every ledger event
   * and reconciliation alert lands in the stream and stops there.
   */
  @IsOptional()
  @IsString()
  NATS_URL = '';

  /** core-ledger's stream (its NATS_STREAM). core-ledger creates it; this side only reads it. */
  @IsString()
  NATS_STREAM = 'DAMP';

  /**
   * The durable consumer's name. Every replica must use the same one — that
   * is what makes them share the work rather than each receive everything.
   */
  @IsString()
  OUTBOX_CONSUMER_DURABLE = 'notifications-outbox';

  /**
   * Where a *newly created* durable starts: `all` (the stream's whole
   * retention, deduped against anything the HTTP door already delivered) or
   * `new`. Ignored once the durable exists — its cursor is the server's.
   */
  @IsString()
  @IsIn(['all', 'new'])
  OUTBOX_CONSUMER_DELIVER_POLICY = 'all';

  /** Deliveries before a message that keeps failing is terminated and counted. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  OUTBOX_CONSUMER_MAX_DELIVERIES = 10;

  /**
   * How old a PENDING delivery's lease must be before a replay or the sweeper
   * may re-send it. Must exceed the longest a send can take (EmailTransport
   * bounds SMTP to well under a minute), or a slow send gets a twin.
   */
  @Type(() => Number)
  @IsInt()
  @Min(10)
  PENDING_STALE_SECONDS = 120;

  /** Times a stranded delivery is re-tried before it is marked FAILED. */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  PENDING_MAX_ATTEMPTS = 5;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  PENDING_SWEEP_SECONDS = 30;
}
