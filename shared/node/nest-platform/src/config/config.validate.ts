import { plainToInstance } from 'class-transformer';
import { validateSync, ValidationError } from 'class-validator';
import { PlatformConfigError } from './config.error';

/**
 * ClassConstructor<T> — a config class with a public no-arg constructor,
 * e.g.:
 *
 *   class AppConfig {
 *     @IsInt() @Min(1) @Max(65535)
 *     PORT: number = 8081;
 *
 *     @IsString() @IsNotEmpty()
 *     DATABASE_URL!: string;
 *
 *     @IsString() @IsIn(['debug', 'info', 'warn', 'error'])
 *     LOG_LEVEL: string = 'info';
 *   }
 *
 * Field names are the environment variable names themselves (matching
 * shared/go/platform's `env:"NAME"` tag convention) — plainToInstance reads
 * straight off process.env, so `DATABASE_URL: string` *is* the `env:"DATABASE_URL"`
 * mapping, no separate tag needed. A class field initializer (`PORT: number = 8081`)
 * is the `default:"..."` equivalent: class-transformer only overwrites it when
 * the raw env actually supplies a value. `required:"true"` is whatever
 * class-validator decorator makes empty/missing fail (`@IsNotEmpty()`,
 * `@IsDefined()`, or simply not marking the field `@IsOptional()`).
 */
export type ClassConstructor<T> = new (...args: unknown[]) => T;

/**
 * createConfigValidator adapts a class-validator/class-transformer config
 * class into the `validate` function @nestjs/config's `ConfigModule.forRoot`
 * expects. Its whole job is the one property that matters most here: collect
 * *every* validation failure — not just the first — into one thrown error,
 * matching shared/go/platform's LoadConfig, which appends every problem to a
 * slice across the whole struct before returning, rather than a loop that
 * returns on the first bad field.
 *
 * class-validator's validateSync already does not stop at the first
 * property with an error by default; this only has to flatten its
 * ValidationError[] (which nests per-property, and per-property can nest
 * further for object/array fields) into the flat string[] shape
 * PlatformConfigError carries.
 */
export function createConfigValidator<T extends object>(
  cls: ClassConstructor<T>,
): (raw: Record<string, unknown>) => T {
  return (raw: Record<string, unknown>): T => {
    const instance = plainToInstance(cls, raw, {
      enableImplicitConversion: true,
      exposeDefaultValues: true,
    });

    const errors = validateSync(instance as object, {
      skipMissingProperties: false,
      forbidUnknownValues: false,
      whitelist: false,
      stopAtFirstError: false,
    });

    if (errors.length > 0) {
      throw new PlatformConfigError(flattenValidationErrors(errors));
    }

    return instance;
  };
}

/**
 * flattenValidationErrors walks class-validator's ValidationError tree
 * (which nests for object/array-typed fields) into "PROPERTY: constraint
 * message, other constraint message" lines, one per offending property —
 * the same one-problem-per-var granularity as shared/go/platform/config.go's
 * `problems = append(problems, fmt.Sprintf("%s: %v", envKey, err))`.
 */
export function flattenValidationErrors(errors: ValidationError[], pathPrefix = ''): string[] {
  const problems: string[] = [];

  for (const error of errors) {
    const path = pathPrefix ? `${pathPrefix}.${error.property}` : error.property;

    if (error.constraints) {
      const messages = Object.values(error.constraints).join(', ');
      problems.push(`${path}: ${messages}`);
    }

    if (error.children && error.children.length > 0) {
      problems.push(...flattenValidationErrors(error.children, path));
    }
  }

  return problems;
}
