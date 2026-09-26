import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

/**
 * A representative service config class, the same shape a real DAMP service
 * (identity, bff, ...) would write: field names double as the env var names
 * (PlatformConfigModule reads process.env straight into these), a field
 * initializer is the `default:"..."` equivalent, and no `@IsOptional()`/
 * initializer combination makes a field `required:"true"`-equivalent.
 */
export class DemoConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 8081;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';
}
