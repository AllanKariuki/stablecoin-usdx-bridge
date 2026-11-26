import { Transform, Type } from 'class-transformer';
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

  // --- Service-to-service auth (H2). Every core-ledger call carries
  // payments' own service-account token; core-ledger verifies it and checks
  // ledger.settlement.
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
  // normal state: RailRegistry simply does not register this rail, and an
  // intent that needs it is refused with RAIL_UNAVAILABLE rather than settled
  // against a stub.
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

  // --- M-Pesa B2C (payouts) ---
  //
  // Daraja's B2C API authenticates as the initiator configured in the portal,
  // not as the business shortcode: InitiatorName is that account's username,
  // and SecurityCredential is its password encrypted with Safaricom's public
  // certificate. The portal generates the encrypted value; it is used
  // verbatim here and never logged. Both are needed only for payouts — STK
  // deposits are unaffected — so leaving them blank keeps the rail usable for
  // collection and refuses disbursement with RAIL_UNAVAILABLE.
  @IsOptional()
  @IsString()
  MPESA_INITIATOR_NAME = '';

  @IsOptional()
  @IsString()
  MPESA_SECURITY_CREDENTIAL = '';

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

  // The stub rail settles an intent with no real money moving — it books
  // ledger credit for fiat that never arrived. Off unless a deployment opts in
  // explicitly (services/payments/.env turns it on for local development).
  // envalid-style boolean parsing is done here by hand because class-
  // transformer's implicit Boolean() conversion would read the string "false"
  // as true.
  @Transform(({ obj, key }) => {
    const raw = (obj as Record<string, unknown>)[key];
    return raw === true || String(raw).toLowerCase() === 'true';
  })
  @IsBoolean()
  STUB_RAIL_ENABLED = false;

  // services/audit-trail's base URL. The audit relay drains audit_outbox to
  // its POST /internal/events; empty means events wait, durably, until set.
  @IsString()
  AUDIT_TRAIL_URL = '';

  // Bearer token audit-trail's INGEST_TOKEN expects.
  @IsString()
  AUDIT_TRAIL_TOKEN = '';
}
