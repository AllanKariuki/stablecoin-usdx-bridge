// Package worker drains the bridge saga queue.
//
// It replaces one line — `go saga.Execute(correlationID)` — and the whole
// reason it exists is what that line could not survive: a restart. A
// goroutine's progress lives only in the process that started it, so a deploy,
// an OOM kill or a crash mid-bridge left funds parked in the suspense account
// with nothing in the system that would ever go looking for them.
//
// The queue is the bridge_transfers table. Claims use SELECT … FOR UPDATE
// SKIP LOCKED under a heartbeated lease, so N replicas are safe against each
// other without Redis, etcd or leader election, and a SIGKILLed worker loses
// nothing but the remainder of its lease.
package worker

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"sync"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/retry"

	"github.com/google/uuid"
)

type Config struct {
	// Concurrency is how many sagas this replica runs at once. Each one can
	// block for minutes on chain finality, so this is a count of simultaneous
	// waits rather than of CPU work.
	Concurrency int

	// Lease is deliberately far shorter than a chain call can take: it is a
	// crash-detection timeout, kept short and heartbeated, rather than set
	// long and hoped about. Too long and a crashed worker's sagas sit idle
	// until it lapses; too short without a heartbeat and a healthy worker has
	// its work stolen mid-flight.
	Lease         time.Duration
	Heartbeat     time.Duration
	PollInterval  time.Duration
	RetryPolicy   retry.Policy
	ShutdownGrace time.Duration
}

func DefaultConfig() Config {
	return Config{
		Concurrency:  4,
		Lease:        2 * time.Minute,
		Heartbeat:    30 * time.Second,
		PollInterval: time.Second,
		// 12 attempts of exponentially backed-off, fully jittered delay caps
		// out around an hour of trying — long enough to ride out an RPC
		// provider's bad afternoon, short enough that a genuinely broken saga
		// reaches a human the same day.
		RetryPolicy:   retry.Policy{Base: 2 * time.Second, Max: 5 * time.Minute, Budget: 12},
		ShutdownGrace: 30 * time.Second,
	}
}

type Worker struct {
	repo   *ledger.Repository
	saga   *bridge.Saga
	logger *slog.Logger
	cfg    Config

	// id identifies this replica in lease_owner. Hostname alone is not enough
	// — two processes in one container would claim each other's leases — so a
	// per-process uuid is appended.
	id string
}

func New(repo *ledger.Repository, saga *bridge.Saga, logger *slog.Logger, cfg Config) *Worker {
	host, err := os.Hostname()
	if err != nil {
		host = "unknown"
	}
	return &Worker{
		repo:   repo,
		saga:   saga,
		logger: logger,
		cfg:    cfg,
		id:     host + "/" + uuid.New().String(),
	}
}

func (w *Worker) ID() string { return w.id }

// Run sweeps whatever the last process left behind, then loops until ctx is
// cancelled.
func (w *Worker) Run(ctx context.Context) {
	w.sweep(ctx)

	var wg sync.WaitGroup
	for i := 0; i < w.cfg.Concurrency; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			w.loop(ctx)
		}()
	}

	w.logger.Info("saga worker started",
		slog.String("worker_id", w.id),
		slog.Int("concurrency", w.cfg.Concurrency),
		slog.Duration("lease", w.cfg.Lease))

	wg.Wait()
	w.logger.Info("saga worker stopped", slog.String("worker_id", w.id))
}

// sweep is the boot-time recovery pass: every saga that was mid-flight when
// the last process died becomes immediately claimable, ahead of whatever
// backoff it was sitting out.
//
// This is the caller Repository.InFlight() was documented as having and never
// had — the method existed, said "resume after crash" in its doc comment, and
// was referenced by nothing in the repository.
func (w *Worker) sweep(ctx context.Context) {
	stranded, err := w.repo.SweepInFlight(ctx)
	if err != nil {
		w.logger.Error("boot sweep failed", slog.Any("error", err))
		return
	}
	if len(stranded) == 0 {
		w.logger.Info("boot sweep found no in-flight sagas")
		return
	}

	ids := make([]string, 0, len(stranded))
	for _, t := range stranded {
		ids = append(ids, t.CorrelationID)
	}
	w.logger.Warn("boot sweep found in-flight sagas from a previous process; resuming",
		slog.Int("count", len(stranded)),
		slog.Any("correlation_ids", ids))
}

func (w *Worker) loop(ctx context.Context) {
	ticker := time.NewTicker(w.cfg.PollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}

		t, err := w.repo.ClaimTransfer(ctx, w.id, w.cfg.Lease)
		if err != nil {
			if ctx.Err() != nil {
				return
			}
			w.logger.Error("claiming a saga failed", slog.Any("error", err))
			continue
		}
		if t == nil {
			continue
		}
		w.process(ctx, t)
	}
}

func (w *Worker) process(ctx context.Context, t *ledger.BridgeTransfer) {
	log := w.logger.With(
		slog.String("correlation_id", t.CorrelationID),
		slog.String("kind", string(t.Kind)),
		slog.Int("attempt", t.Attempts))

	// A chain call can outlast any lease worth using as a crash-detection
	// timeout, so the lease is renewed for as long as this attempt runs.
	stop := w.heartbeat(ctx, t.CorrelationID, log)
	result := w.saga.Execute(ctx, t.CorrelationID)
	stop()

	switch {
	case !result.Failed():
		log.Info("saga attempt completed", slog.String("stage", result.Stage))
		return

	case !result.Retry:
		// The saga already ran its recovery and settled itself.
		log.Warn("saga failed terminally",
			slog.String("stage", result.Stage), slog.Any("error", result.Err))
		return

	case errors.Is(result.Err, bridge.ErrLockHeld):
		// Another worker is on it. Nothing was tried, so the attempt the claim
		// counted is given back — otherwise contention alone could exhaust a
		// budget and dead-letter a saga that never reached a chain.
		if err := w.repo.ReleaseContended(ctx, t.CorrelationID, w.cfg.Lease); err != nil {
			log.Error("releasing a contended saga failed", slog.Any("error", err))
		}
		return

	case w.cfg.RetryPolicy.Exhausted(t.Attempts):
		// Budget spent on transient failures. Abandon moves no money: all
		// anyone knows is that something would not answer, and "we don't
		// know" is the worst possible moment to un-mint.
		if err := w.saga.Abandon(ctx, t.CorrelationID, result.Stage, result.Err); err != nil {
			log.Error("dead-lettering a saga failed", slog.Any("error", err))
		}
		if err := w.repo.ReleaseTransfer(ctx, t.CorrelationID, w.cfg.RetryPolicy.Max, result.Err.Error()); err != nil {
			log.Error("releasing an abandoned saga failed", slog.Any("error", err))
		}

	default:
		backoff := w.cfg.RetryPolicy.Backoff(t.Attempts)
		log.Warn("saga attempt failed, retrying",
			slog.String("stage", result.Stage),
			slog.Duration("backoff", backoff),
			slog.Any("error", result.Err))
		if err := w.repo.ReleaseTransfer(ctx, t.CorrelationID, backoff, result.Err.Error()); err != nil {
			log.Error("rescheduling a saga failed", slog.Any("error", err))
		}
	}
}

// heartbeat renews the lease until the returned stop function is called. If
// the lease is lost — because this worker was declared dead and another
// claimed the saga — it stops renewing rather than fighting for it back.
func (w *Worker) heartbeat(ctx context.Context, correlationID string, log *slog.Logger) func() {
	done := make(chan struct{})
	var once sync.Once

	go func() {
		ticker := time.NewTicker(w.cfg.Heartbeat)
		defer ticker.Stop()
		for {
			select {
			case <-done:
				return
			case <-ctx.Done():
				return
			case <-ticker.C:
				if err := w.repo.ExtendLease(ctx, correlationID, w.id, w.cfg.Lease); err != nil {
					log.Warn("lost the lease on a saga mid-attempt", slog.Any("error", err))
					return
				}
			}
		}
	}()

	return func() { once.Do(func() { close(done) }) }
}
