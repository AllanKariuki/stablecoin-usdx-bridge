package reconciliation

import (
	"context"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/push"
)

// Pusher gets a one-shot job's gauges to Prometheus.
//
// A CronJob pod lives for a couple of seconds. Prometheus scrapes on an
// interval measured in tens of seconds, so by the time it comes looking the
// pod is gone and the gauges went with it — which would make the metric-based
// paging this phase is built around silently never fire. The Pushgateway
// exists for exactly this shape of job.
//
// It is optional, and its absence degrades gracefully to "the exit code and
// the persisted run row are the signal", which is what `reconcile --watch`
// and the local `make reconcile` rely on.
type Pusher struct {
	pusher *push.Pusher
}

func NewPusher(url, job string, m *Metrics) *Pusher {
	if url == "" || m == nil {
		return &Pusher{}
	}
	reg := prometheus.NewRegistry()
	reg.MustRegister(m.Collectors()...)
	return &Pusher{pusher: push.New(url, job).Gatherer(reg)}
}

func (p *Pusher) Push(ctx context.Context) error {
	if p.pusher == nil {
		return nil
	}
	// Add, not Push: Push replaces *every* metric under the job name, which
	// would wipe a concurrent group's series. Nothing else writes under this
	// job today, but a second reconciler (a per-currency one, say) should not
	// have to discover that by losing its metrics.
	return p.pusher.AddContext(ctx)
}
