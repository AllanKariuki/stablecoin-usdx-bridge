package platform

import (
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

// Metrics holds a private prometheus registry (not the global default
// registerer) so two services' middleware chains never collide if they ever
// end up in the same process (e.g. a table-driven test that boots more than
// one Chain). Each service still exposes a normal /metrics endpoint.
type Metrics struct {
	registry   *prometheus.Registry
	requests   *prometheus.CounterVec
	duration   *prometheus.HistogramVec
	inFlight   prometheus.Gauge
}

func NewMetrics(service string) *Metrics {
	reg := prometheus.NewRegistry()
	reg.MustRegister(prometheus.NewGoCollector(), prometheus.NewProcessCollector(prometheus.ProcessCollectorOpts{}))

	m := &Metrics{
		registry: reg,
		requests: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name:        "http_requests_total",
			Help:        "Total HTTP requests processed.",
			ConstLabels: prometheus.Labels{"service": service},
		}, []string{"method", "route", "status"}),
		duration: prometheus.NewHistogramVec(prometheus.HistogramOpts{
			Name:        "http_request_duration_seconds",
			Help:        "HTTP request latency in seconds.",
			ConstLabels: prometheus.Labels{"service": service},
			Buckets:     prometheus.DefBuckets,
		}, []string{"method", "route", "status"}),
		inFlight: prometheus.NewGauge(prometheus.GaugeOpts{
			Name:        "http_requests_in_flight",
			Help:        "HTTP requests currently being served.",
			ConstLabels: prometheus.Labels{"service": service},
		}),
	}
	reg.MustRegister(m.requests, m.duration, m.inFlight)
	return m
}

// Register adds a service's own collectors to this instance's private
// registry, so they are exposed by the same /metrics endpoint as the HTTP
// ones.
//
// It exists because the registry is deliberately private (see the type's
// comment) — which is the right default and also means a service with domain
// metrics of its own had no way to publish them without reaching for
// prometheus.DefaultRegisterer and reintroducing exactly the global-state
// collision this type avoids.
func (m *Metrics) Register(collectors ...prometheus.Collector) error {
	for _, c := range collectors {
		if err := m.registry.Register(c); err != nil {
			// An AlreadyRegisteredError means the caller registered the same
			// collector twice, which is a programming error worth reporting
			// rather than a duplicate series worth tolerating.
			return err
		}
	}
	return nil
}

// Middleware records one observation per request, keyed by the matched
// route pattern (not the raw path) so /wallets/:id doesn't explode the
// cardinality of every wallet id ever requested.
func (m *Metrics) Middleware() fiber.Handler {
	return func(c *fiber.Ctx) error {
		start := time.Now()
		m.inFlight.Inc()
		defer m.inFlight.Dec()

		err := c.Next()

		route := c.Route().Path
		if route == "" {
			route = "unmatched"
		}
		status := strconv.Itoa(c.Response().StatusCode())
		labels := prometheus.Labels{"method": c.Method(), "route": route, "status": status}
		m.requests.With(labels).Inc()
		m.duration.With(labels).Observe(time.Since(start).Seconds())

		return err
	}
}

// Handler exposes /metrics in the Prometheus text exposition format.
func (m *Metrics) Handler() fiber.Handler {
	return adaptor.HTTPHandler(promhttp.HandlerFor(m.registry, promhttp.HandlerOpts{}))
}
