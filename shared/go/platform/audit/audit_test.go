package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

func discard() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

type execRecorder struct {
	query string
	args  []any
}

func (r *execRecorder) ExecContext(_ context.Context, q string, args ...any) (sql.Result, error) {
	r.query, r.args = q, args
	return nil, nil
}

func TestEnqueueMintsAnIDAndTruncatesToMicroseconds(t *testing.T) {
	var exec execRecorder
	at := time.Date(2026, 11, 12, 10, 0, 0, 123456789, time.FixedZone("EAT", 3*3600))

	id, err := Enqueue(context.Background(), &exec, Event{
		Actor: "user-1", Action: "ledger.wallet.status_changed", Service: "core-ledger", OccurredAt: at,
	})
	if err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	if id == "" || exec.args[0] != id {
		t.Fatalf("id = %q, args[0] = %v; the returned id must be the one written", id, exec.args[0])
	}

	var body map[string]any
	if err := json.Unmarshal([]byte(exec.args[2].(string)), &body); err != nil {
		t.Fatalf("payload is not JSON: %v", err)
	}
	// Postgres keeps microseconds. A nanosecond timestamp would hash one way
	// in audit-trail on insert and another on re-read.
	if got := body["occurred_at"]; got != "2026-11-12T07:00:00.123456Z" {
		t.Fatalf("occurred_at = %v, want UTC truncated to microseconds", got)
	}
	if body["id"] != id || body["outcome"] != "SUCCESS" {
		t.Fatalf("payload id/outcome = %v/%v", body["id"], body["outcome"])
	}
}

func TestEnqueueRefusesAnEventAuditTrailWouldRefuse(t *testing.T) {
	var exec execRecorder
	for _, e := range []Event{
		{Action: "x", Service: "s"},
		{Actor: "a", Service: "s"},
		{Actor: "a", Action: "x"},
	} {
		if _, err := Enqueue(context.Background(), &exec, e); !errors.Is(err, ErrInvalidEvent) {
			t.Fatalf("Enqueue(%+v) = %v, want ErrInvalidEvent", e, err)
		}
	}
	if exec.query != "" {
		t.Fatal("nothing should have been written")
	}
}

func TestEnqueueFillsRequestFactsFromContext(t *testing.T) {
	var exec execRecorder
	ctx := WithRequest(context.Background(), Request{
		ID: "req-1", SourceIP: "10.0.0.9", UserAgent: "ua", Roles: []string{"ops"},
	})
	if _, err := Enqueue(ctx, &exec, Event{Actor: "a", Action: "x", Service: "s"}); err != nil {
		t.Fatal(err)
	}
	var body Event
	_ = json.Unmarshal([]byte(exec.args[2].(string)), &body)
	if body.RequestID != "req-1" || body.SourceIP != "10.0.0.9" || body.UserAgent != "ua" ||
		len(body.ActorRoles) != 1 || body.ActorRoles[0] != "ops" {
		t.Fatalf("request facts not carried: %+v", body)
	}

	// Roles the caller computed win over the header's.
	_, _ = Enqueue(ctx, &exec, Event{Actor: "a", Action: "x", Service: "s", ActorRoles: []string{"approver"}})
	_ = json.Unmarshal([]byte(exec.args[2].(string)), &body)
	if len(body.ActorRoles) != 1 || body.ActorRoles[0] != "approver" {
		t.Fatalf("explicit roles overwritten: %v", body.ActorRoles)
	}
}

// fiber hands handlers c.Context(), a fasthttp *RequestCtx, and most of this
// platform's handlers pass that straight to the repository. The middleware
// has to reach Enqueue through it, not only through c.UserContext().
func TestMiddlewareReachesBothFiberContexts(t *testing.T) {
	app := fiber.New()
	app.Use(requestid.New())
	app.Use(Middleware())
	var fromFast, fromUser Request
	app.Get("/", func(c *fiber.Ctx) error {
		fromFast = RequestFrom(c.Context())
		fromUser = RequestFrom(c.UserContext())
		return nil
	})

	req := httptest.NewRequest(http.MethodGet, "/", nil)
	req.Header.Set("X-Request-Id", "gw-123")
	req.Header.Set("X-Forwarded-For", "203.0.113.7, 10.0.0.1")
	req.Header.Set("X-Roles", "ops, finance")
	req.Header.Set("User-Agent", "test-agent")
	if _, err := app.Test(req); err != nil {
		t.Fatal(err)
	}

	for name, r := range map[string]Request{"fasthttp": fromFast, "user": fromUser} {
		if r.ID != "gw-123" || r.SourceIP != "203.0.113.7" || r.UserAgent != "test-agent" ||
			len(r.Roles) != 2 || r.Roles[1] != "finance" {
			t.Fatalf("%s context: %+v", name, r)
		}
	}
}

func TestHTTPPublisherClassifiesResponses(t *testing.T) {
	cases := []struct {
		status    int
		ok        bool
		permanent bool
	}{
		{http.StatusCreated, true, false},
		{http.StatusOK, true, false}, // duplicate: already recorded
		{http.StatusBadRequest, false, true},
		{http.StatusUnauthorized, false, true},
		{http.StatusConflict, false, true},
		{http.StatusTooManyRequests, false, false},
		{http.StatusRequestTimeout, false, false},
		{http.StatusInternalServerError, false, false},
		{http.StatusServiceUnavailable, false, false},
	}
	for _, tc := range cases {
		var gotAuth, gotKey, gotPath string
		srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			gotAuth, gotKey, gotPath = r.Header.Get("Authorization"), r.Header.Get("Idempotency-Key"), r.URL.Path
			w.WriteHeader(tc.status)
		}))
		err := NewHTTPPublisher(srv.URL+"/", "s3cret").Publish(context.Background(), Pending{EventID: "ev-1", Payload: `{}`})
		srv.Close()

		var perm *PermanentError
		switch {
		case tc.ok && err != nil:
			t.Errorf("%d: want delivered, got %v", tc.status, err)
		case !tc.ok && err == nil:
			t.Errorf("%d: want an error", tc.status)
		case !tc.ok && errors.As(err, &perm) != tc.permanent:
			t.Errorf("%d: permanent = %v, want %v", tc.status, !tc.permanent, tc.permanent)
		}
		if gotAuth != "Bearer s3cret" || gotKey != "ev-1" || gotPath != "/internal/events" {
			t.Errorf("%d: auth=%q key=%q path=%q", tc.status, gotAuth, gotKey, gotPath)
		}
	}
}

type fakeQueue struct {
	mu          sync.Mutex
	batch       []Pending
	delivered   []int64
	rescheduled map[int64]time.Duration
	dead        []int64
}

func (q *fakeQueue) Claim(context.Context, int, time.Duration) ([]Pending, error) {
	q.mu.Lock()
	defer q.mu.Unlock()
	b := q.batch
	q.batch = nil
	return b, nil
}
func (q *fakeQueue) MarkDelivered(_ context.Context, id int64) error {
	q.delivered = append(q.delivered, id)
	return nil
}
func (q *fakeQueue) Reschedule(_ context.Context, id int64, in time.Duration, _ string) error {
	if q.rescheduled == nil {
		q.rescheduled = map[int64]time.Duration{}
	}
	q.rescheduled[id] = in
	return nil
}
func (q *fakeQueue) MarkDead(_ context.Context, id int64, _ string) error {
	q.dead = append(q.dead, id)
	return nil
}
func (q *fakeQueue) PendingCount(context.Context) (int64, error) { return 0, nil }

type scriptedPublisher map[string]error

func (s scriptedPublisher) Publish(_ context.Context, p Pending) error { return s[p.EventID] }
func (scriptedPublisher) Target() string                               { return "test" }

func TestRelayDeliversRetriesAndDeadLetters(t *testing.T) {
	q := &fakeQueue{batch: []Pending{
		{ID: 1, EventID: "ok"},
		{ID: 2, EventID: "down", Attempts: 40},
		{ID: 3, EventID: "refused"},
	}}
	pub := scriptedPublisher{
		"down":    errors.New("connection refused"),
		"refused": &PermanentError{Status: 400, Body: "actor and action are required"},
	}
	r := newRelay(q, pub, discard())
	r.BackoffMin, r.BackoffMax = time.Second, time.Minute

	n, err := r.RunOnce(context.Background())
	if err != nil || n != 1 {
		t.Fatalf("RunOnce = %d, %v; want 1 delivered", n, err)
	}
	if len(q.delivered) != 1 || q.delivered[0] != 1 {
		t.Fatalf("delivered = %v", q.delivered)
	}
	// Forty failed attempts and still rescheduled, not dead: an outage of
	// audit-trail must not put holes in the trail.
	if in, ok := q.rescheduled[2]; !ok || in <= 0 || in > time.Minute {
		t.Fatalf("transient failure rescheduled = %v (%v), want within (0, 1m]", in, ok)
	}
	if len(q.dead) != 1 || q.dead[0] != 3 {
		t.Fatalf("dead = %v, want only the refused event", q.dead)
	}
}

func TestFullJitterStaysInBounds(t *testing.T) {
	for attempt := 0; attempt < 200; attempt++ {
		d := fullJitter(time.Second, time.Minute, attempt)
		if d <= 0 || d > time.Minute+1 {
			t.Fatalf("attempt %d: backoff %v out of (0, 1m]", attempt, d)
		}
	}
}
