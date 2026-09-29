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

  // Blacklisting and pausing go through maker-checker first. Unset means an
  // enforcement action can be proposed and never executed, which is the
  // correct failure: the alternative is a service that can freeze a
  // customer's tokens with one person's click.
  @IsOptional()
  @IsString()
  WORKFLOW_URL = '';

  @IsOptional()
  @IsString()
  SELF_URL = 'http://localhost:3004';

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
}
