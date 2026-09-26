import { Inject, Injectable } from '@nestjs/common';
import { collectDefaultMetrics, Counter, Gauge, Histogram, Registry } from 'prom-client';
import { PLATFORM_SERVICE_NAME } from '../constants';

/** Matches shared/go/platform/metrics.go's use of prometheus.DefBuckets exactly. */
const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

/**
 * PlatformMetricsService — the direct counterpart of shared/go/platform/metrics.go's
 * Metrics struct. Holds a *private* prom-client Registry (not prom-client's
 * shared global `register`), so two services' — or two tests' — metrics
 * instances never collide in the same process, exactly like the Go side's
 * `prometheus.NewRegistry()` instead of the default registerer.
 * `registry.setDefaultLabels({ service })` is prom-client's equivalent of
 * Go's `ConstLabels: prometheus.Labels{"service": service}` on every metric.
 */
@Injectable()
export class PlatformMetricsService {
  readonly registry: Registry;
  private readonly requests: Counter<'method' | 'route' | 'status'>;
  private readonly duration: Histogram<'method' | 'route' | 'status'>;
  private readonly inFlight: Gauge;

  constructor(@Inject(PLATFORM_SERVICE_NAME) service: string) {
    this.registry = new Registry();
    this.registry.setDefaultLabels({ service });
    collectDefaultMetrics({ register: this.registry });

    this.requests = new Counter({
      name: 'http_requests_total',
      help: 'Total HTTP requests processed.',
      labelNames: ['method', 'route', 'status'],
      registers: [this.registry],
    });

    this.duration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'HTTP request latency in seconds.',
      labelNames: ['method', 'route', 'status'],
      buckets: DEFAULT_BUCKETS,
      registers: [this.registry],
    });

    this.inFlight = new Gauge({
      name: 'http_requests_in_flight',
      help: 'HTTP requests currently being served.',
      registers: [this.registry],
    });
  }

  incInFlight(): void {
    this.inFlight.inc();
  }

  decInFlight(): void {
    this.inFlight.dec();
  }

  /** route must be the matched route pattern, not the raw path — see MetricsInterceptor. */
  observe(method: string, route: string, status: string, seconds: number): void {
    const labels = { method, route, status };
    this.requests.inc(labels);
    this.duration.observe(labels, seconds);
  }

  async metricsText(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
