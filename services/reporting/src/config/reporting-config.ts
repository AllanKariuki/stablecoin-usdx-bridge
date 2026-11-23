import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Max, Min } from 'class-validator';

export class ReportingConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3008;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // Every figure in every report is read from the service that owns it, at
  // the moment the run executes. This service owns no numbers.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  // --- Service-to-service auth (H2). Every core-ledger call carries
  // reporting's own service-account token; core-ledger verifies it and
  // checks ledger.reports.read.
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
  // service-account JWT whose audience is the `reporting` resource client.
  // Both required — there is no unauthenticated mode.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  AUTH_ISSUER_URL!: string;

  @IsString()
  @IsNotEmpty()
  AUTH_AUDIENCE = 'reporting';

  @IsOptional()
  @IsString()
  AUDIT_TRAIL_URL = '';

  // --- Superset.
  //
  // The admin credential stays in this process. The frontend used to call
  // Superset's guest-token endpoint directly, which requires exactly this
  // credential — so either it was in the browser or the call had never
  // worked. Minting server-side is the fix.
  @IsOptional()
  @IsString()
  SUPERSET_URL = '';

  @IsOptional()
  @IsString()
  SUPERSET_ADMIN_USERNAME = '';

  @IsOptional()
  @IsString()
  SUPERSET_ADMIN_PASSWORD = '';

  // Bearer token audit-trail's INGEST_TOKEN expects. AUDIT_TRAIL_URL (above)
  // doubles as where this service's own audit relay delivers.
  @IsString()
  AUDIT_TRAIL_TOKEN = '';
}
