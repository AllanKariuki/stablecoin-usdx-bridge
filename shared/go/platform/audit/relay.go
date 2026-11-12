package audit

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"math/rand"
	"net/http"
	"strings"
	"time"
)

// Publisher delivers one outbox row. A seam so the relay's retry and
// dead-letter decisions are testable without an audit-trail running.
type Publisher interface {
	Publish(ctx context.Context, p Pending) error
	Target() string
}

// PermanentError is a refusal that retrying cannot change — a 4xx from
// audit-trail other than 408/429. The relay dead-letters it at once rather
// than spending hours re-sending a body that will be refused every time.
type PermanentError struct {
	Status int
	Body   string
}

func (e *PermanentError) Error() string {
	return fmt.Sprintf("audit-trail refused the event (HTTP %d): %s", e.Status, e.Body)
}

// HTTPPublisher POSTs to audit-trail's POST /internal/events.
type HTTPPublisher struct {
	url    string
	token  string
	client *http.Client
}

// NewHTTPPublisher takes audit-trail's base URL (AUDIT_TRAIL_URL) and the
// shared ingest token (AUDIT_TRAIL_TOKEN), which may be empty against an
// audit-trail that does not require one.
func NewHTTPPublisher(baseURL, token string) *HTTPPublisher {
	return &HTTPPublisher{
		url:    strings.TrimRight(baseURL, "/") + "/internal/events",
		token:  token,
		client: &http.Client{Timeout: 10 * time.Second},
	}
}

func (p *HTTPPublisher) Target() string { return p.url }

func (p *HTTPPublisher) Publish(ctx context.Context, e Pending) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.url, bytes.NewBufferString(e.Payload))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	// The id is in the body too; the header is for logs and proxies that
	// never parse one.
	req.Header.Set("Idempotency-Key", e.EventID)
	if p.token != "" {
		req.Header.Set("Authorization", "Bearer "+p.token)
	}

	resp, err := p.client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))

	switch {
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		// 201 recorded, 200 already recorded under this id — both mean the
		// trail has it.
		return nil
	case resp.StatusCode == http.StatusRequestTimeout || resp.StatusCode == http.StatusTooManyRequests:
		return fmt.Errorf("audit-trail returned %s", resp.Status)
	case resp.StatusCode >= 400 && resp.StatusCode < 500:
		return &PermanentError{Status: resp.StatusCode, Body: strings.TrimSpace(string(body))}
	default:
		return fmt.Errorf("audit-trail returned %s", resp.Status)
	}
}

// Relay drains the outbox. Safe to run on every replica: Claim hands each row
// to one of them.
//
// There is deliberately no attempt budget for transient failures. core-ledger's
// event outbox gives up after twelve, which suits a consumer that can be
// re-driven; here, giving up on an event because audit-trail was down for an
// afternoon would put a hole in the trail exactly where an outage was. The
// backlog gauge is the alarm instead — an outbox that only grows is the
// symptom — and only an outright refusal (PermanentError) is dead-lettered.
type Relay struct {
	store     queue
	publisher Publisher
	logger    *slog.Logger
	metrics   *Metrics

	Interval   time.Duration
	BatchSize  int
	Visibility time.Duration
	BackoffMin time.Duration
	BackoffMax time.Duration
}

// queue is the part of *Store the relay uses — an interface only so the
// retry and dead-letter decisions can be unit-tested without Postgres. The
// claim itself is tested against Postgres, because SKIP LOCKED has no
// meaningful fake.
type queue interface {
	Claim(ctx context.Context, limit int, visibility time.Duration) ([]Pending, error)
	MarkDelivered(ctx context.Context, id int64) error
	Reschedule(ctx context.Context, id int64, in time.Duration, cause string) error
	MarkDead(ctx context.Context, id int64, cause string) error
	PendingCount(ctx context.Context) (int64, error)
}

func NewRelay(store *Store, publisher Publisher, logger *slog.Logger) *Relay {
	return newRelay(store, publisher, logger)
}

func newRelay(store queue, publisher Publisher, logger *slog.Logger) *Relay {
	return &Relay{
		store:     store,
		publisher: publisher,
		logger:    logger,

		Interval:   2 * time.Second,
		BatchSize:  100,
		Visibility: 60 * time.Second,
		BackoffMin: 2 * time.Second,
		BackoffMax: 5 * time.Minute,
	}
}

func (r *Relay) WithMetrics(m *Metrics) *Relay {
	r.metrics = m
	return r
}

func (r *Relay) Run(ctx context.Context) {
	ticker := time.NewTicker(r.Interval)
	defer ticker.Stop()
	r.logger.Info("audit relay started", slog.String("target", r.publisher.Target()))
	for {
		select {
		case <-ctx.Done():
			r.logger.Info("audit relay stopped")
			return
		case <-ticker.C:
			if _, err := r.RunOnce(ctx); err != nil {
				r.logger.Error("audit relay pass failed", slog.Any("error", err))
			}
		}
	}
}

// RunOnce claims and delivers one batch, returning how many were delivered.
//
// Rows are marked one at a time rather than in a batch at the end: a relay
// that crashes halfway through would otherwise re-send everything it had
// already delivered. Harmless, because audit-trail dedupes, but pointless.
func (r *Relay) RunOnce(ctx context.Context) (int, error) {
	// Read on every pass, empty or not: a gauge that only updates when there
	// is work goes silent exactly when the queue drains, and silence looks the
	// same as a dead relay.
	if r.metrics != nil {
		if n, err := r.store.PendingCount(ctx); err == nil {
			r.metrics.pending.Set(float64(n))
		}
	}

	batch, err := r.store.Claim(ctx, r.BatchSize, r.Visibility)
	if err != nil {
		return 0, fmt.Errorf("claiming audit events: %w", err)
	}

	delivered := 0
	for _, p := range batch {
		perr := r.publisher.Publish(ctx, p)
		if perr == nil {
			if err := r.store.MarkDelivered(ctx, p.ID); err != nil {
				return delivered, err
			}
			delivered++
			if r.metrics != nil {
				r.metrics.delivered.WithLabelValues(p.Action).Inc()
			}
			continue
		}

		var permanent *PermanentError
		if errors.As(perr, &permanent) {
			r.logger.Error("audit-trail refused an event; dead-lettered",
				slog.String("event_id", p.EventID), slog.String("action", p.Action), slog.Any("error", perr))
			if r.metrics != nil {
				r.metrics.dead.Inc()
			}
			if err := r.store.MarkDead(ctx, p.ID, perr.Error()); err != nil {
				return delivered, err
			}
			continue
		}

		wait := r.backoff(p.Attempts)
		r.logger.Warn("audit event delivery failed; retrying",
			slog.String("event_id", p.EventID), slog.Int("attempt", p.Attempts),
			slog.Duration("backoff", wait), slog.Any("error", perr))
		if err := r.store.Reschedule(ctx, p.ID, wait, perr.Error()); err != nil {
			return delivered, err
		}
	}
	return delivered, nil
}

// backoff is full-jitter exponential, capped: attempt n waits a uniform draw
// from (0, min(max, min·2^(n-1))]. Full jitter because every replica's relay
// failed at the same moment when audit-trail went down, and without it they
// would all retry in lockstep when it comes back.
func (r *Relay) backoff(attempt int) time.Duration {
	return fullJitter(r.BackoffMin, r.BackoffMax, attempt)
}

func fullJitter(min, max time.Duration, attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if min <= 0 {
		min = time.Second
	}
	if max < min {
		max = min
	}
	exp := float64(min) * math.Pow(2, float64(attempt-1))
	if exp > float64(max) || math.IsInf(exp, 0) {
		exp = float64(max)
	}
	return time.Duration(rand.Int63n(int64(exp))) + 1
}
