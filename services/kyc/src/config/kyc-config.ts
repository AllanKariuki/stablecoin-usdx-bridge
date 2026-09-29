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

  // Maker-checker. Unset means nothing can be approved in this environment —
  // cases reach PENDING_APPROVAL and stop, which is the correct failure for a
  // gate whose approval service is missing.
  @IsOptional()
  @IsString()
  WORKFLOW_URL = '';

  // Where workflow posts its decision back. Must be reachable from workflow.
  @IsOptional()
  @IsString()
  SELF_URL = 'http://localhost:3007';

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
}
