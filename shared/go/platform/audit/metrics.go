package audit

import "github.com/prometheus/client_golang/prometheus"

// Metrics is the relay's instrumentation. The backlog gauge is the one that
// matters: with no attempt budget, an audit-trail that has stopped accepting
// produces no dead letters — only a number that climbs.
type Metrics struct {
	pending   prometheus.Gauge
	delivered *prometheus.CounterVec
	dead      prometheus.Counter
}

func NewMetrics() *Metrics {
	return &Metrics{
		pending: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "audit_outbox_pending_events",
			Help: "Audit events committed with their action and not yet recorded by services/audit-trail.",
		}),
		delivered: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "audit_outbox_delivered_total",
			Help: "Audit events services/audit-trail accepted, by action.",
		}, []string{"action"}),
		dead: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "audit_outbox_dead_lettered_total",
			Help: "Audit events services/audit-trail refused outright. Each is a gap in the trail until a human looks.",
		}),
	}
}

func (m *Metrics) Collectors() []prometheus.Collector {
	return []prometheus.Collector{m.pending, m.delivered, m.dead}
}
