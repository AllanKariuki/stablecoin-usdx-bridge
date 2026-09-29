import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * bff's environment surface. Field names double as the env var names —
 * @damp/nest-platform's PlatformConfigModule reads process.env straight
 * into these and collects every missing/invalid one into a single error at
 * boot (see shared/go/platform/config.go's LoadConfig for the Go
 * equivalent this mirrors).
 */
export class BffConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3002; // per docs/building-plan.md's port map: identity 3001, bff 3002

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  // core-ledger is the one backend bff *reshapes* for — the camelCase and
  // Money translation, and the cross-wallet aggregations core-ledger has no
  // endpoint for.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  // P4's two services are forwarded to rather than reshaped: they already
  // emit camelCase and the Money shape, so a translation layer here would be
  // a second place for the two to disagree. Empty is a supported state — the
  // proxy answers 503 with a readable reason, which is the honest response
  // for a feature this environment does not run.
  @IsString()
  PAYMENTS_URL = '';

  @IsString()
  NOTIFICATIONS_URL = '';

  // P5. Same treatment: forwarded, not reshaped, and empty is a supported
  // state that answers 503 with a readable reason.
  @IsString()
  WORKFLOW_URL = '';

  @IsString()
  KYC_URL = '';

  @IsString()
  COMPLIANCE_URL = '';

  // P7.
  @IsString()
  REPORTING_URL = '';

  @IsString()
  AUDIT_TRAIL_URL = '';
}
