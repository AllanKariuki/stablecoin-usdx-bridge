package outbox

import "github.com/prometheus/client_golang/prometheus"

// Metrics is the relay's own instrumentation.
//
// The gauge that matters is the backlog. An outbox never loses an event —
// that is the whole point of the table — so a consumer that has quietly
// stopped accepting produces no errors anywhere, just a number that goes up
// and a downstream view that gets older. It is the only symptom.
type Metrics struct {
	pending    prometheus.Gauge
	published  *prometheus.CounterVec
	deadLetter prometheus.Counter
}

func NewMetrics() *Metrics {
	return &Metrics{
		pending: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "outbox_pending_events",
			Help: "Events written to the outbox and not yet delivered.",
		}),
		published: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "outbox_published_total",
			Help: "Events delivered, by event type.",
		}, []string{"event_type"}),
		deadLetter: prometheus.NewCounter(prometheus.CounterOpts{
			Name: "outbox_dead_lettered_total",
			Help: "Events whose delivery attempt budget was spent. These stay in the table forever: an event nobody could deliver is evidence, not garbage.",
		}),
	}
}

func (m *Metrics) Collectors() []prometheus.Collector {
	return []prometheus.Collector{m.pending, m.published, m.deadLetter}
}
