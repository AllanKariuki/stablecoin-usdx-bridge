import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * payments' environment surface. Field names double as env var names — see
 * services/rms/src/config/rms-config.ts and shared/go/platform/config.go for
 * the same pattern in both languages.
 */
export class PaymentsConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3003; // per docs/building-plan.md's port map

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Every intent that settles does so by calling core-ledger. payments owns
  // no balance.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  @IsString()
  CORE_LEDGER_SERVICE_TOKEN = '';

  // Where the outbox relay delivers payment events. Empty is fine: events
  // queue in the outbox and are delivered once it is set. Either way a
  // notification can never fail a settlement that already happened.
  @IsString()
  NOTIFICATIONS_URL = '';

  // How often the relay sweeps for due events. Each commit that writes one
  // also kicks the relay immediately, so this bounds retry latency, not the
  // normal case.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  OUTBOX_RELAY_SECONDS = 5;

  // Attempts before an event is marked DEAD. Backoff caps at five minutes, so
  // the default of 100 rides out roughly eight hours of notifications being
  // unreachable.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  OUTBOX_MAX_ATTEMPTS = 100;

  // Where payment links point. Not the API base — a link goes in an email and
  // is opened in a browser.
  @IsString()
  PUBLIC_APP_URL = 'http://localhost:5173';

  // --- M-Pesa (Daraja sandbox) ---
  //
  // Chosen because it is free and self-service, which is the plan's test for
  // whether a real integration belongs in a phase at all. Unconfigured is a
  // normal state: RailRegistry falls back to the stub and says so.
  @IsUrl({ require_tld: false })
  MPESA_BASE_URL = 'https://sandbox.safaricom.co.ke';

  @IsOptional()
  @IsString()
  MPESA_CONSUMER_KEY = '';

  @IsOptional()
  @IsString()
  MPESA_CONSUMER_SECRET = '';

  @IsOptional()
  @IsString()
  MPESA_SHORTCODE = '';

  @IsOptional()
  @IsString()
  MPESA_PASSKEY = '';

  // Must be publicly reachable for Daraja to POST to it — an ngrok tunnel in
  // local development. An unreachable callback URL is the single most common
  // reason an STK push appears to hang forever.
  @IsOptional()
  @IsString()
  MPESA_CALLBACK_URL = '';

  // Shared secret a rail must present on POST /rails/:rail/callback, as
  // `?token=` (Daraja cannot send headers, so it goes in MPESA_CALLBACK_URL)
  // or an `x-rail-callback-token` header. Empty means the HTTP callback route
  // rejects everything: unauthenticated settlement is not a usable default.
  // The stub rail settles in-process and does not need it.
  @IsString()
  RAIL_CALLBACK_SECRET = '';

  @Type(() => Boolean)
  @IsBoolean()
  STUB_RAIL_ENABLED = true;

  // services/audit-trail's base URL. The audit relay drains audit_outbox to
  // its POST /internal/events; empty means events wait, durably, until set.
  @IsString()
  AUDIT_TRAIL_URL = '';

  // Bearer token audit-trail's INGEST_TOKEN expects.
  @IsString()
  AUDIT_TRAIL_TOKEN = '';
}
