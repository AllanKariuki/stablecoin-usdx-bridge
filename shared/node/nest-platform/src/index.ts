// Config
export { PlatformConfigModule, PlatformConfigOptions } from './config/config.module';
export { PlatformConfigError } from './config/config.error';
export { createConfigValidator, flattenValidationErrors, ClassConstructor } from './config/config.validate';

// Logging
export { PlatformLoggingModule, PlatformLoggingOptions } from './logging/logging.module';
export { RequestIdInterceptor } from './logging/request-id.interceptor';
export { Logger as PlatformLogger, PinoLogger, InjectPinoLogger } from 'nestjs-pino';

// Tracing
export { PlatformTracingModule, PlatformTracingOptions } from './tracing/tracing.module';
export { OtelInterceptor } from './tracing/otel.interceptor';
export { traceIdFrom } from './tracing/trace-context';

// Health
export { PlatformHealthModule, PlatformHealthOptions } from './health/health.module';
export { PlatformHealthService, CheckResult, ReadinessResult } from './health/health.service';
export { PlatformHealthController } from './health/health.controller';
export { Checker } from './health/health.types';

// Metrics
export { PlatformMetricsModule, PlatformMetricsOptions } from './metrics/metrics.module';
export { PlatformMetricsService } from './metrics/metrics.service';
export { MetricsInterceptor } from './metrics/metrics.interceptor';
export { PlatformMetricsController } from './metrics/metrics.controller';

// Errors
export { ErrorResponse } from './errors/error-response.interface';
export { ErrorEnvelopeFilter } from './errors/error-envelope.filter';
export { PlatformException } from './errors/platform.exception';

// Shutdown
export { installGracefulShutdown, runShutdownSequence, ShutdownOptions } from './shutdown/shutdown';

// Aggregator module
export { PlatformModule, PlatformModuleOptions } from './platform.module';

// Audit producer (twin of shared/go/platform/audit)
export {
  AUDIT_OUTBOX_SCHEMA_SQL,
  AuditEvent,
  AuditOutcome,
  AuditRequest,
  InvalidAuditEventError,
  Queryable,
  auditPayload,
  enqueueAuditEvent,
} from './audit/audit-event';
export { AuditContext, auditRequestFrom } from './audit/audit-request';
export {
  AuditPublisher,
  AuditRelay,
  AuditRelayLogger,
  AuditRelayOptions,
  HttpAuditPublisher,
  PendingAuditEvent,
  PermanentAuditError,
  fullJitter,
} from './audit/audit-relay';

// Constants / tokens
export {
  PLATFORM_SERVICE_NAME,
  PLATFORM_VERSION_INFO,
  REQUEST_ID_HEADER,
  DEFAULT_DRAIN_PERIOD_MS,
  DEFAULT_SHUTDOWN_TIMEOUT_MS,
  VersionInfo,
} from './constants';
