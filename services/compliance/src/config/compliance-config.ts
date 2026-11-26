import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class ComplianceConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3004;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Freezing a wallet goes through the route that already exists, and whose
  // ACCOUNT_FROZEN 409 every service already handles.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  // --- Service-to-service auth (H2). Every core-ledger call carries
  // compliance's own service-account token; core-ledger verifies it and
  // checks ledger.wallet-status.
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

  // --- Inbound service-to-service auth (H3). Every request must carry a
  // service-account JWT whose audience is the `compliance` resource client.
  // Both required — there is no unauthenticated mode (the approval callback
  // is @HmacAuthenticated, not public).
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  AUTH_ISSUER_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUTH_AUDIENCE = 'compliance';

  // Blacklisting and pausing go through maker-checker first. Unset means an
  // enforcement action can be proposed and never executed, which is the
  // correct failure: the alternative is a service that can freeze a
  // customer's tokens with one person's click.
  @IsOptional()
  @IsString()
  WORKFLOW_URL = '';

  // HMAC key shared with services/workflow (its CALLBACK_SECRET). Without it
  // every decision callback is refused.
  @IsOptional()
  @IsString()
  WORKFLOW_CALLBACK_SECRET = '';

  @IsOptional()
  @IsString()
  SELF_URL = 'http://localhost:13004';

  @IsOptional()
  @IsString()
  NOTIFICATIONS_URL = '';

  // How long a screening result is trusted. A clear screen from six months
  // ago is not evidence that somebody is not on today's list.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  SCREENING_TTL_HOURS = 24;

  // The longest window any rule looks back over. It bounds the history query
  // that runs on every posting, so it is configuration rather than a
  // max() over the rules — a single mis-set rule should not turn every
  // evaluation into a full-table scan.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  HISTORY_WINDOW_MINUTES = 1440;

  // services/audit-trail's base URL. The audit relay drains audit_outbox to
  // its POST /internal/events; empty means events wait, durably, until set.
  @IsString()
  AUDIT_TRAIL_URL = '';

  // Bearer token audit-trail's INGEST_TOKEN expects.
  @IsString()
  AUDIT_TRAIL_TOKEN = '';
}
