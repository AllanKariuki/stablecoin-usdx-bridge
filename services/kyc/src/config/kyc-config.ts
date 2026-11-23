import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class KycConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3007;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Freezing and unfreezing goes through core-ledger's existing
  // POST /wallets/:id/status, whose ACCOUNT_FROZEN 409 every service already
  // handles. A second freezing concept would be a second answer to "can this
  // party transact".
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  // --- Service-to-service auth (H2). Every core-ledger call carries kyc's
  // own service-account token; core-ledger verifies it and checks
  // ledger.wallet-status.
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
  // service-account JWT whose audience is the `kyc` resource client. Both
  // required — there is no unauthenticated mode (the approval callback is
  // @HmacAuthenticated, not public).
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  AUTH_ISSUER_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUTH_AUDIENCE = 'kyc';

  // Maker-checker. Unset means nothing can be approved in this environment —
  // cases reach PENDING_APPROVAL and stop, which is the correct failure for a
  // gate whose approval service is missing.
  @IsOptional()
  @IsString()
  WORKFLOW_URL = '';

  // HMAC key shared with services/workflow (its CALLBACK_SECRET). Without it
  // every decision callback is refused.
  @IsOptional()
  @IsString()
  WORKFLOW_CALLBACK_SECRET = '';

  // Where workflow posts its decision back. Must be reachable from workflow.
  @IsOptional()
  @IsString()
  SELF_URL = 'http://localhost:13007';

  // --- Document storage. MinIO locally. ---
  @IsOptional()
  @IsString()
  S3_ENDPOINT = '';

  @IsString()
  S3_BUCKET = 'damp-kyc';

  @IsString()
  S3_REGION = 'us-east-1';

  @IsOptional()
  @IsString()
  S3_ACCESS_KEY = '';

  @IsOptional()
  @IsString()
  S3_SECRET_KEY = '';

  // Five minutes: long enough for a slow upload, short enough that a URL
  // leaked in a screenshot is useless by the time anybody reads it.
  @Type(() => Number)
  @IsInt()
  @Min(30)
  S3_PRESIGN_EXPIRY_SECONDS = 300;

  // services/audit-trail's base URL. The audit relay drains audit_outbox to
  // its POST /internal/events; empty means events wait, durably, until set.
  @IsString()
  AUDIT_TRAIL_URL = '';

  // Bearer token audit-trail's INGEST_TOKEN expects.
  @IsString()
  AUDIT_TRAIL_TOKEN = '';
}
