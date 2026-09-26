/**
 * PlatformConfigError aggregates every invalid or missing environment
 * variable found during a single validation pass, so a fresh clone with a
 * blank .env fails once with a complete list rather than a hunt-one-fix-one
 * loop across five redeploys.
 *
 * Direct counterpart to shared/go/platform/config.go's ConfigError: same
 * `Problems`/`problems` field name (adjusted for TS casing) and the same
 * "invalid configuration (N problem(s))" message shape, so a human reading
 * both services' boot logs side by side recognizes the same failure mode.
 */
export class PlatformConfigError extends Error {
  public readonly problems: string[];

  constructor(problems: string[]) {
    super(PlatformConfigError.formatMessage(problems));
    this.name = 'PlatformConfigError';
    this.problems = problems;
    Object.setPrototypeOf(this, PlatformConfigError.prototype);
  }

  private static formatMessage(problems: string[]): string {
    return `invalid configuration (${problems.length} problem(s)):\n  - ${problems.join('\n  - ')}`;
  }
}
