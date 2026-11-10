import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNotEmpty, IsString, IsUrl, Max, Min } from 'class-validator';

/**
 * rms's environment surface. Field names double as the env var names —
 * @damp/nest-platform's PlatformConfigModule reads process.env straight
 * into these and collects every missing/invalid one into a single error at
 * boot (mirrors shared/go/platform/config.go's LoadConfig and
 * services/identity/src/config/identity-config.ts).
 */
export class RmsConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3005; // per docs/building-plan.md's port map: identity 3001, bff 3002, payments 3003, compliance 3004, rms 3005

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  // rms's own Postgres database — see migrations/ and
  // infra/postgres/init/02-p3-databases.sql.
  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // The only service rms writes to: POST /reserves/custodian-snapshots,
  // which is the call that unblocks reconciliation's Leg C.
  @IsUrl({ require_tld: false })
  @IsNotEmpty()
  CORE_LEDGER_URL!: string;

  @IsString()
  CORE_LEDGER_SERVICE_TOKEN = '';

  /**
   * How often the poller asks every active custodian what it holds.
   *
   * A minute is short enough that the DoD's "post a snapshot $1,000 short
   * and see the alert within one interval" is a demo rather than a wait,
   * and long enough that a real bank adapter isn't being hammered. The
   * number that actually governs alert latency is core-ledger's
   * reconciliation schedule, not this one.
   */
  @Type(() => Number)
  @IsInt()
  @Min(5)
  CUSTODIAN_POLL_SECONDS = 60;

  /**
   * Turns the poller off without removing the service. A deployment that
   * imports statements by hand (POST /custodians/:id/statements) wants the
   * API and not the schedule.
   */
  @Type(() => Boolean)
  @IsBoolean()
  CUSTODIAN_POLL_ENABLED = true;
}
