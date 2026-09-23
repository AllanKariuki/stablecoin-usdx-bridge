/**
 * DI tokens and platform-wide defaults. Mirrors the constants scattered
 * across shared/go/platform's package-level `const` blocks (defaultDrainPeriod,
 * defaultShutdownTimeout, header names, etc.) but centralized here since Nest
 * favors an explicit token registry over Go's implicit package-private consts.
 */

export const PLATFORM_SERVICE_NAME = Symbol('PLATFORM_SERVICE_NAME');
export const PLATFORM_VERSION_INFO = Symbol('PLATFORM_VERSION_INFO');

export const REQUEST_ID_HEADER = 'x-request-id';

/** Matches shared/go/platform/shutdown.go's defaultDrainPeriod. */
export const DEFAULT_DRAIN_PERIOD_MS = 5000;
/** Matches shared/go/platform/shutdown.go's defaultShutdownTimeout. */
export const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15000;

export interface VersionInfo {
  service: string;
  version: string;
  commit: string;
}
