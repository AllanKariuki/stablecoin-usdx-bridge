package outbox

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/retry"
)

// Publisher is the seam the P3 NATS migration turns on. Today the only
// implementation posts HTTP; when the indexer lands, a nats.Publish
// implementation drops in here and no domain code changes — which is the
// whole reason the outbox was built before there was a bus to publish to.
type Publisher interface {
	Publish(ctx context.Context, e Event) error
	Target() string
}

// HTTPPublisher POSTs the event payload to a single endpoint. One producer,
// one consumer, no broker: exactly what P2 needs and no more.
type HTTPPublisher struct {
	URL    string
	Client *http.Client
}

func NewHTTPPublisher(url string) *HTTPPublisher {
	return &HTTPPublisher{URL: url, Client: &http.Client{Timeout: 10 * time.Second}}
}

func (p *HTTPPublisher) Target() string { return p.URL }

func (p *HTTPPublisher) Publish(ctx context.Context, e Event) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.URL, bytes.NewBufferString(e.Payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Event-Type", e.EventType)
	req.Header.Set("X-Event-Id", strconv.FormatInt(e.ID, 10))
	// The consumer is expected to dedupe on this: at-least-once is what an
	// outbox guarantees, and a relay that crashes between POST and
	// MarkPublished will deliver the same event twice by design.
	req.Header.Set("Idempotency-Key", e.EventType+":"+strconv.FormatInt(e.ID, 10))

	resp, err := p.Client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 200 && resp.StatusCode < 300 {
		return nil
	}
	return fmt.Errorf("publishing event %d: consumer returned %s", e.ID, resp.Status)
}

// Relay drains the outbox. It is safe to run N of them: Claim hands each row
// to exactly one.
type Relay struct {
	store     *Store
	publisher Publisher
	logger    *slog.Logger
	policy    retry.Policy
	metrics   *Metrics

	Interval   time.Duration
	BatchSize  int
	Visibility time.Duration
}

func NewRelay(store *Store, publisher Publisher, logger *slog.Logger) *Relay {
	return &Relay{
		store:     store,
		publisher: publisher,
		logger:    logger,
		policy:    retry.Policy{Base: 2 * time.Second, Max: 5 * time.Minute, Budget: 12},

		Interval:  2 * time.Second,
		BatchSize: 100,
		// Long enough that a slow consumer doesn't cause a second relay to
		// publish the same event while the first is still waiting on it.
		Visibility: 60 * time.Second,
	}
}

// WithMetrics is optional: a relay with no metrics still drains correctly,
// it just has no way to tell anyone it has stopped.
func (r *Relay) WithMetrics(m *Metrics) *Relay {
	r.metrics = m
	return r
}

func (r *Relay) Run(ctx context.Context) {
	ticker := time.NewTicker(r.Interval)
	defer ticker.Stop()

	r.logger.Info("outbox relay started",
		slog.String("target", r.publisher.Target()),
		slog.Duration("interval", r.Interval))

	for {
		select {
		case <-ctx.Done():
			r.logger.Info("outbox relay stopped")
			return
		case <-ticker.C:
			if _, err := r.RunOnce(ctx); err != nil {
				r.logger.Error("outbox relay pass failed", slog.Any("error", err))
			}
		}
	}
}

// RunOnce claims and publishes one batch, returning how many were delivered.
func (r *Relay) RunOnce(ctx context.Context) (int, error) {
	// The backlog gauge is read even on an empty pass. A relay that reports
	// only when it has work would go silent exactly when the queue drains —
	// and silence is indistinguishable from the process having died.
	if r.metrics != nil {
		if n, cerr := r.store.PendingCount(ctx); cerr == nil {
			r.metrics.pending.Set(float64(n))
		}
	}

	events, err := r.store.Claim(ctx, r.BatchSize, r.Visibility)
	if err != nil {
		return 0, fmt.Errorf("claiming outbox events: %w", err)
	}
	if len(events) == 0 {
		return 0, nil
	}

	delivered := make([]int64, 0, len(events))
	for _, e := range events {
		err := r.publisher.Publish(ctx, e)
		if err == nil {
			delivered = append(delivered, e.ID)
			if r.metrics != nil {
				r.metrics.published.WithLabelValues(e.EventType).Inc()
			}
			continue
		}

		// e.Attempts is post-increment: Claim already counted this try.
		if r.policy.Exhausted(e.Attempts) {
			r.logger.Error("outbox event exhausted its attempt budget, dead-lettered",
				slog.Int64("event_id", e.ID),
				slog.String("event_type", e.EventType),
				slog.String("aggregate_id", e.AggregateID),
				slog.Int("attempts", e.Attempts),
				slog.Any("error", err))
			if r.metrics != nil {
				r.metrics.deadLetter.Inc()
			}
			if derr := r.store.MarkDead(ctx, e.ID, err.Error()); derr != nil {
				return len(delivered), derr
			}
			continue
		}

		backoff := r.policy.Backoff(e.Attempts)
		if rerr := r.store.Reschedule(ctx, e.ID, backoff, err.Error()); rerr != nil {
			return len(delivered), rerr
		}
		r.logger.Warn("outbox publish failed, retrying",
			slog.Int64("event_id", e.ID),
			slog.Int("attempt", e.Attempts),
			slog.Duration("backoff", backoff),
			slog.Any("error", err))
	}

	if err := r.store.MarkPublished(ctx, delivered); err != nil {
		return 0, fmt.Errorf("marking %d events published: %w", len(delivered), err)
	}
	return len(delivered), nil
}
