package reconciliation

import (
	"context"
	"encoding/json"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"

	"github.com/prometheus/client_golang/prometheus"
)

// Sink is what a run tells the outside world.
//
// The old code called a package-level alert() that was a log.Printf with the
// word ALERT in it, on a ticker that ran once per API replica. Two things were
// wrong with that beyond the obvious: a log line cannot be paged from without
// a log-scraping alert rule nobody had written, and calling a webhook directly
// from the job would have made the one control that catches an unbacked mint
// depend on Slack being up.
//
// So the job emits a *metric* and an *event*. Paging happens from the metric
// (see infra/observability/prometheus/alerts.yml) — Prometheus is already
// responsible for noticing when a number is wrong and already has the
// deduplication, grouping and silencing that an alert channel needs. The event
// goes through the transactional outbox, which is how services/notifications
// turns it into a Slack message and a case in the UI without the job knowing
// either exists.
type Sink interface {
	ObserveRun(ctx context.Context, r Report)
	BreakOpened(ctx context.Context, b ledger.ReconciliationBreak)
	BreakResolved(ctx context.Context, b ledger.ReconciliationBreak)
}

type NopSink struct{}

func (NopSink) ObserveRun(context.Context, Report)                      {}
func (NopSink) BreakOpened(context.Context, ledger.ReconciliationBreak) {}
func (NopSink) BreakResolved(context.Context, ledger.ReconciliationBreak) {
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

// Event types the outbox carries for reconciliation. Same
// damp.<domain>.<event>.v1 shape as the ledger's own, so the NATS subject and
// the HTTP relay agree without a translation table.
const (
	EventBreakOpened   = "damp.reserves.reconciliation_break_opened.v1"
	EventBreakResolved = "damp.reserves.reconciliation_break_resolved.v1"
	EventRunCompleted  = "damp.reserves.reconciliation_run_completed.v1"

	aggregateReconciliation = "RECONCILIATION"
)

// Metrics is the gauge set a Grafana panel and an alert rule read. Gauges
// rather than counters throughout: the question is always "is it wrong right
// now", never "how many times has it been wrong".
type Metrics struct {
	legOK        *prometheus.GaugeVec
	legDrift     *prometheus.GaugeVec
	openBreaks   prometheus.Gauge
	lastRun      *prometheus.GaugeVec
	runsTotal    *prometheus.CounterVec
	snapshotAge  *prometheus.GaugeVec
	custodianAge prometheus.Gauge
}

func NewMetrics() *Metrics {
	return &Metrics{
		// 1 healthy, 0 broken, absent when the leg was not evaluated. The
		// absence matters: `reconciliation_leg_ok{leg="LEG_C"}` having no
		// series at all is what "nobody has ever told us what the bank holds"
		// looks like, and an alert rule can say so explicitly rather than
		// reading a missing check as a passing one.
		legOK: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "reconciliation_leg_ok",
			Help: "1 when a reconciliation leg is balanced, 0 when it is broken. A leg that was not evaluated has no series.",
		}, []string{"leg"}),
		legDrift: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "reconciliation_leg_drift",
			Help: "Signed drift for a reconciliation leg, in the leg's own smallest units.",
		}, []string{"leg"}),
		openBreaks: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "reconciliation_open_breaks",
			Help: "Reconciliation breaks currently open (unresolved).",
		}),
		lastRun: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "reconciliation_last_run_timestamp_seconds",
			Help: "Unix time of the last reconciliation run, by status.",
		}, []string{"status"}),
		runsTotal: prometheus.NewCounterVec(prometheus.CounterOpts{
			Name: "reconciliation_runs_total",
			Help: "Reconciliation runs performed, by status.",
		}, []string{"status"}),
		snapshotAge: prometheus.NewGaugeVec(prometheus.GaugeOpts{
			Name: "reconciliation_chain_supply_snapshot_age_seconds",
			Help: "Age of the newest chain supply snapshot the indexer has written.",
		}, []string{"chain"}),
		custodianAge: prometheus.NewGauge(prometheus.GaugeOpts{
			Name: "reconciliation_custodian_snapshot_age_seconds",
			Help: "Age of the custodian balance Leg C was evaluated against.",
		}),
	}
}

// Collectors is what the caller registers. Returned rather than self-
// registering so the same Metrics can go into a service's private registry
// (see shared/go/platform's Metrics) instead of the global default.
func (m *Metrics) Collectors() []prometheus.Collector {
	return []prometheus.Collector{
		m.legOK, m.legDrift, m.openBreaks, m.lastRun, m.runsTotal, m.snapshotAge, m.custodianAge,
	}
}

// ---------------------------------------------------------------------------
// The real sink
// ---------------------------------------------------------------------------

// OutboxSink writes gauges and enqueues events. The outbox write uses the
// repository's own handle rather than joining a money transaction — there
// isn't one here; a reconciliation run moves nothing — but it still goes
// through the outbox so delivery is durable and at-least-once rather than a
// best-effort HTTP call from a CronJob pod that is about to exit.
type OutboxSink struct {
	repo    *ledger.Repository
	metrics *Metrics
}

func NewOutboxSink(repo *ledger.Repository, metrics *Metrics) *OutboxSink {
	return &OutboxSink{repo: repo, metrics: metrics}
}

func (s *OutboxSink) ObserveRun(ctx context.Context, r Report) {
	if s.metrics != nil {
		s.metrics.runsTotal.WithLabelValues(r.Status).Inc()
		s.metrics.lastRun.WithLabelValues(r.Status).Set(float64(time.Now().Unix()))

		set := func(leg string, ok bool, drift float64) {
			s.metrics.legOK.WithLabelValues(leg).Set(boolGauge(ok))
			s.metrics.legDrift.WithLabelValues(leg).Set(drift)
		}
		if r.LegA != nil {
			set(LegAName, r.LegA.OK(), floatOf(r.LegA.Drift))
		}
		if r.LegB != nil {
			set(LegBName, r.LegB.OK(), floatOf(r.LegB.Drift))
		}
		if r.LegC != nil {
			set(LegCName, r.LegC.OK(), floatOf(r.LegC.Drift))
			s.metrics.custodianAge.Set(time.Since(r.LegC.AsOf).Seconds())
		}
	}

	// The run event is what a dashboard subscribes to for a live "last
	// reconciled at" without polling the ledger.
	s.enqueue(ctx, EventRunCompleted, r.RunID, map[string]any{
		"run_id":          r.RunID,
		"status":          r.Status,
		"opened_breaks":   len(r.Opened),
		"resolved_breaks": len(r.Resolved),
		"completed_at":    time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (s *OutboxSink) BreakOpened(ctx context.Context, b ledger.ReconciliationBreak) {
	s.bumpOpenBreaks(ctx)
	s.enqueue(ctx, EventBreakOpened, b.ID, breakPayload(b))
}

func (s *OutboxSink) BreakResolved(ctx context.Context, b ledger.ReconciliationBreak) {
	s.bumpOpenBreaks(ctx)
	s.enqueue(ctx, EventBreakResolved, b.ID, breakPayload(b))
}

func (s *OutboxSink) bumpOpenBreaks(ctx context.Context) {
	if s.metrics == nil {
		return
	}
	if n, err := s.repo.OpenBreakCount(ctx); err == nil {
		s.metrics.openBreaks.Set(float64(n))
	}
}

func (s *OutboxSink) enqueue(ctx context.Context, eventType, aggregateID string, payload map[string]any) {
	body, err := json.Marshal(payload)
	if err != nil {
		return
	}
	_ = s.repo.EnqueueEvent(ctx, eventType, aggregateReconciliation, aggregateID, body)
}

// breakPayload is written out field by field rather than marshalled from the
// GORM model: the moment it leaves the process it is a public contract, and a
// column rename must not silently become a breaking change for every consumer.
// Drifts are strings for the same reason every amount in this platform is —
// a JSON number loses precision above 2^53 and a USD-X drift is in 1e-6 units.
func breakPayload(b ledger.ReconciliationBreak) map[string]any {
	out := map[string]any{
		"break_id":     b.ID,
		"leg":          b.Leg,
		"code":         b.Code,
		"detail":       b.Detail,
		"drift":        bigString(b),
		"opened_at":    b.OpenedAt.UTC().Format(time.RFC3339),
		"observations": b.Observations,
		"severity":     severityFor(b.Leg),
	}
	if b.ResolvedAt != nil {
		out["resolved_at"] = b.ResolvedAt.UTC().Format(time.RFC3339)
		out["open_for_seconds"] = int64(b.ResolvedAt.Sub(b.OpenedAt).Seconds())
	}
	return out
}

// severityFor is the only place the three legs are ranked. Leg B is critical
// because a broken peg means USD-X exists against nothing; Leg A and Leg C are
// "something is wrong and a human must look", which is still a page but not a
// stop-the-platform one.
func severityFor(leg string) string {
	if leg == LegBName {
		return "critical"
	}
	return "high"
}

func bigString(b ledger.ReconciliationBreak) string {
	if b.Drift == nil {
		return "0"
	}
	return b.Drift.String()
}

func boolGauge(ok bool) float64 {
	if ok {
		return 1
	}
	return 0
}

// floatOf is lossy above 2^53 and that is acceptable *here only*: a Prometheus
// gauge is a float64 by definition, and the exact value lives in the break row
// and in the event payload as a decimal string. Nothing decides anything from
// this number except an alert threshold and a graph.
func floatOf(v *big.Int) float64 {
	if v == nil {
		return 0
	}
	f, _ := new(big.Float).SetInt(v).Float64()
	return f
}
