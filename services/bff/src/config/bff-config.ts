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

  // core-ledger is the only backend bff calls today — every write forwards
  // to exactly one owning service, never orchestrates (see
  // docs/building-plan.md's "Build the BFF" decision).
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;
}
