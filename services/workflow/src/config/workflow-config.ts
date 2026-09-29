import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class WorkflowConfig {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3006;

  @IsString()
  @IsIn(['debug', 'info', 'warn', 'error'])
  LOG_LEVEL = 'info';

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  // How often decisions are re-delivered and lapsed requests expired. An
  // approval nobody hears about is the same as no approval, so this is a
  // drain loop rather than a fire-once-at-decision-time call.
  @Type(() => Number)
  @IsInt()
  @Min(1)
  CALLBACK_DRAIN_SECONDS = 15;
}
