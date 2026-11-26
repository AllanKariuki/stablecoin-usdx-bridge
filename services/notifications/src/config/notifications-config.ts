import { Type, Transform } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class NotificationsConfig {
  /**
   * The container/in-cluster port is 3000; the host publishes 13000.
   *
   * frontend/public/runtime-config.js declares
   * VITE_APP_WEBSOCKET_URL = ws://localhost:13000/ws, and the frontend was
   * written against it before this service existed. Compose maps host 13000
   * onto this port, and scripts/stack.sh runs the process with PORT=13000 so
   * the host listener is the port the browser dials. That is also why Grafana
   * sits on 53000 — see the plan's port map.
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
   * token arrives as a query parameter and is verified here. Required since
   * H3: without it every upgrade is refused (see ws.auth.ts) — there is no
   * unauthenticated fallback except the explicit dev opt-in
   * NOTIFICATIONS_WS_DEV_AUTH below.
   */
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
   * uses. The lookup carries notifications' own service token
   * (identity.resolve) since H3.
   */
  @IsOptional()
  @IsString()
  IDENTITY_SERVICE_URL = '';

  // --- Inbound HTTP service-to-service auth (H3). Every HTTP request must
  // carry a service-account JWT whose audience is the `notifications`
  // resource client. Both required — there is no unauthenticated mode.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  AUTH_ISSUER_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUTH_AUDIENCE = 'notifications';

  // --- The service account notifications calls OUT with (identity.resolve
  // for the WebSocket subject->party lookup).
  @IsString()
  @IsNotEmpty()
  SERVICE_CLIENT_ID!: string;

  @IsString()
  @IsNotEmpty()
  SERVICE_CLIENT_SECRET!: string;

  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  KEYCLOAK_BASE_URL!: string;

  @IsString()
  KEYCLOAK_REALM = 'damp';

  /**
   * The one escape hatch from WebSocket authentication, and it is opt-in
   * twice over: only when ENV=local AND this is explicitly set to true does
   * the WS endpoint accept an unverified partyId query parameter. Never set
   * it anywhere a real user can reach the port.
   */
  // Parsed by hand: class-transformer's implicit Boolean() would read the
  // env string "false" as true, and without any conversion @IsBoolean rejects
  // the string outright.
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    return raw === true || String(raw).toLowerCase() === 'true';
  })
  @IsOptional()
  @IsBoolean()
  NOTIFICATIONS_WS_DEV_AUTH = false;

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

  // --- H7: this service's NATS credentials. infra/nats/nats.conf declares
  // one user per service with per-subject permissions; NatsService refuses
  // to start when NATS_URL is set and either is missing.
  @IsOptional()
  @IsString()
  NATS_USER = '';

  @IsOptional()
  @IsString()
  NATS_PASSWORD = '';

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
   * When > 0, the durable is created with this `inactive_threshold`, so the
   * server removes it after that long with no interest. Unset (0) in every
   * real deployment — the durable must outlive restarts — and set only by
   * the e2e suite, which cannot delete its test durables any more (no NATS
   * user may delete a consumer since H7).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  OUTBOX_CONSUMER_INACTIVE_THRESHOLD_MS = 0;

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
