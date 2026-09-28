// Package metrics turns what the tailer did into the numbers an alert rule
// watches.
//
// The two that matter are both about *not* happening: cursor lag (the indexer
// stopped advancing) and reorg depth (the chain took something back). An
// indexer that has silently stopped is the worst state this service can be
// in, because reconciliation keeps passing against its last snapshot — see
// core-ledger's RECONCILE_SNAPSHOT_MAX_AGE for the other half of that defence.
package metrics

import (
	"context"

	"github.com/prometheus/client_golang/prometheus"
)

type Observer struct {
	cursor     *prometheus.GaugeVec
	head       *prometheus.GaugeVec
	lag        *prometheus.GaugeVec
	events     *prometheus.CounterVec
	reorgs     *prometheus.CounterVec
	reorgDepth *prometheus.GaugeVec
	orphaned   *prometheus.CounterVec
	leading    prometheus.Gauge
}

func New() *Observer {
	return &Observer{
		cursor: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "indexer_cursor_height",
			Help: "The highest height the indexer has recorded as canonical.",
		}, []string{"chain"}),
		head: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "indexer_chain_head",
			Help: "The chain's current height as the indexer last read it.",
		}, []string{"chain"}),
		lag: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "indexer_cursor_lag",
			Help: "Head minus cursor. Expected to sit at the confirmation depth; a growing value means the indexer has fallen behind or stopped.",
		}, []string{"chain"}),
		events: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "indexer_events_total",
			Help: "Chain events recorded.",
		}, []string{"chain"}),
		reorgs: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "indexer_reorgs_total",
			Help: "Reorganisations detected.",
		}, []string{"chain"}),
		reorgDepth: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "indexer_last_reorg_depth",
			Help: "How many blocks the most recent reorganisation un-believed.",
		}, []string{"chain"}),
		orphaned: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "indexer_orphaned_events_total",
			Help: "Events marked non-canonical by a reorganisation. Any non-zero value on a chain the platform mints against deserves a look.",
		}, []string{"chain"}),
		leading: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "indexer_leader",
			Help: "1 when this replica holds the indexer lock and is advancing the cursor.",
		}),
	}
}

func (o *Observer) Collectors() []prometheus.Collector {
	return []prometheus.Collector{
		o.cursor, o.head, o.lag, o.events, o.reorgs, o.reorgDepth, o.orphaned, o.leading,
	}
}

func (o *Observer) SetLeading(leading bool) {
	if leading {
		o.leading.Set(1)
		return
	}
	o.leading.Set(0)
}

func (o *Observer) Advanced(_ context.Context, chain string, _, to, head uint64, events int) {
	o.cursor.WithLabelValues(chain).Set(float64(to))
	o.head.WithLabelValues(chain).Set(float64(head))
	lag := float64(0)
	if head > to {
		lag = float64(head - to)
	}
	o.lag.WithLabelValues(chain).Set(lag)
	if events > 0 {
		o.events.WithLabelValues(chain).Add(float64(events))
	}
}

func (o *Observer) Reorged(_ context.Context, chain string, _ uint64, depth uint64, orphanedEvents int64) {
	o.reorgs.WithLabelValues(chain).Inc()
	o.reorgDepth.WithLabelValues(chain).Set(float64(depth))
	if orphanedEvents > 0 {
		o.orphaned.WithLabelValues(chain).Add(float64(orphanedEvents))
	}
}
