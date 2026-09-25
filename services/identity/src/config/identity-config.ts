import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * identity's environment surface. Field names double as the env var names
 * — @damp/nest-platform's PlatformConfigModule reads process.env straight
 * into these and collects every missing/invalid one into a single error at
 * boot (see shared/go/platform/config.go's LoadConfig for the Go
 * equivalent this mirrors, and services/bff/src/config/bff-config.ts for
 * the sibling Node config this one is modeled on).
 */
export class IdentityConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3001; // per docs/building-plan.md's port map: identity 3001, bff 3002

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  // identity's own Postgres database — see migrations/ and
  // infra/postgres/init/01-identity-db.sql.
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // The only other service identity calls: POST /wallets, to ensure a
  // party's default fiat wallet once provisioned.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  // Keycloak's base URL (NOT the realm issuer bff/auth-proxy use) — Admin
  // API paths are /admin/realms/<realm>/... under this.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  KEYCLOAK_BASE_URL!: string;

  @IsString()
  @IsNotEmpty()
  KEYCLOAK_REALM = 'damp';

  @IsString()
  @IsNotEmpty()
  KEYCLOAK_ADMIN_CLIENT_ID = 'identity-service';

  @IsString()
  @IsNotEmpty()
  KEYCLOAK_ADMIN_CLIENT_SECRET!: string;
}
