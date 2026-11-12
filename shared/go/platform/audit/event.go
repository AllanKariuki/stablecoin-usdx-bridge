// Package audit is the producer half of services/audit-trail: a per-service
// outbox for actor events, and the relay that delivers them.
//
// Why an outbox and not a POST from the handler. services/audit-trail's
// recording endpoint is built never to fail, but "built never to fail" is not
// "never unreachable", and a producer that POSTs inline has to choose, on
// every outage, between failing the action it was auditing (the audit service
// becomes a platform-wide SPOF) and doing it unaudited (the trail has holes
// exactly when something was going wrong). Writing the event into the
// producer's own database, in the same transaction as the action, makes that
// choice disappear: the action and its evidence commit or roll back together,
// and delivery is a separate, retryable problem.
//
// Delivery is at-least-once — a relay that crashes between the POST and
// marking the row delivered sends it again — so every event carries an id
// minted at enqueue time, and services/audit-trail records an id once. That
// pairing is the "exactly once" a reader of the trail sees.
//
// The package speaks database/sql rather than GORM so services that do not use
// GORM (signer, audit-trail itself, the indexer) can produce without taking
// the dependency. A GORM caller passes its transaction's ConnPool — see
// Execer.
package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Schema is the outbox table every producer migrates in, verbatim, through
// its own migration tool. It is exported so a producer's migration and this
// package's tests can't drift into two shapes of the same table; the
// NestJS twin in @damp/nest-platform carries the identical DDL.
const Schema = `
CREATE TABLE IF NOT EXISTS audit_outbox (
    id              BIGSERIAL PRIMARY KEY,
    -- The idempotency id services/audit-trail dedupes on. Minted here, at
    -- enqueue, so every redelivery of this row carries the same one.
    event_id        TEXT NOT NULL UNIQUE,
    action          TEXT NOT NULL,
    payload         JSONB NOT NULL,
    status          TEXT NOT NULL DEFAULT 'PENDING'
                    CHECK (status IN ('PENDING', 'DELIVERED', 'DEAD')),
    attempts        INTEGER NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error      TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    delivered_at    TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_audit_outbox_due
    ON audit_outbox (next_attempt_at, id) WHERE status = 'PENDING';
`

// Outcome mirrors the audit-trail events.outcome CHECK constraint.
type Outcome string

const (
	OutcomeSuccess Outcome = "SUCCESS"
	OutcomeFailure Outcome = "FAILURE"
	OutcomeDenied  Outcome = "DENIED"
)

// Event is one actor event, in the wire shape services/audit-trail's
// POST /internal/events accepts. Written out field by field rather than
// shared with audit-trail's store.Event: this is a public contract between
// services, and a column rename on either side must not silently become a
// change to it.
type Event struct {
	// ID is the idempotency id. Leave empty and Enqueue mints a UUID; set it
	// only when the caller already has a natural one that is unique per
	// *event* (not per subject — one subject has many events).
	ID string `json:"id"`

	Actor       string   `json:"actor"`
	ActorRoles  []string `json:"actor_roles,omitempty"`
	OnBehalfOf  string   `json:"on_behalf_of,omitempty"`
	Action      string   `json:"action"`
	SubjectType string   `json:"subject_type,omitempty"`
	SubjectID   string   `json:"subject_id,omitempty"`
	Service     string   `json:"service"`
	Outcome     Outcome  `json:"outcome,omitempty"`

	BeforeState map[string]any `json:"before_state,omitempty"`
	AfterState  map[string]any `json:"after_state,omitempty"`
	Metadata    map[string]any `json:"metadata,omitempty"`

	RequestID string `json:"request_id,omitempty"`
	SourceIP  string `json:"source_ip,omitempty"`
	UserAgent string `json:"user_agent,omitempty"`

	// OccurredAt is when the action happened — the producer's clock, inside
	// the producer's transaction — not when the relay got round to it. A
	// trail that dated events by delivery would reorder an outage's backlog.
	OccurredAt time.Time `json:"-"`
}

// Execer is satisfied by *sql.DB, *sql.Tx and *sql.Conn — and by a GORM
// transaction's Statement.ConnPool, which inside db.Transaction(...) *is* the
// *sql.Tx. That last one is the point: Enqueue must run on the handle that is
// writing the action, or it is not transactional.
type Execer interface {
	ExecContext(ctx context.Context, query string, args ...any) (sql.Result, error)
}

// ErrInvalidEvent is returned for an event audit-trail would refuse. Failing
// at enqueue — inside the caller's transaction — is deliberate: the
// alternative is an action that commits with evidence that will be
// dead-lettered on its first delivery.
var ErrInvalidEvent = errors.New("invalid audit event")

// Enqueue writes e to the outbox on tx and returns its event id.
//
// There is no variant that opens its own transaction, for the same reason
// core-ledger's outbox.Enqueue has none: an event committed separately from
// the change it describes is worse than no event — it is evidence of
// something that may have rolled back.
func Enqueue(ctx context.Context, tx Execer, e Event) (string, error) {
	if err := e.normalise(ctx); err != nil {
		return "", err
	}
	payload, err := e.Payload()
	if err != nil {
		return "", err
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO audit_outbox (event_id, action, payload) VALUES ($1, $2, $3::jsonb)`,
		e.ID, e.Action, string(payload))
	if err != nil {
		return "", fmt.Errorf("enqueueing audit event %s: %w", e.Action, err)
	}
	return e.ID, nil
}

// normalise fills what the producer may leave out and refuses what
// audit-trail would refuse.
func (e *Event) normalise(ctx context.Context) error {
	if strings.TrimSpace(e.Actor) == "" || strings.TrimSpace(e.Action) == "" {
		return fmt.Errorf("%w: actor and action are required (action %q)", ErrInvalidEvent, e.Action)
	}
	if e.Service == "" {
		return fmt.Errorf("%w: service is required (action %q)", ErrInvalidEvent, e.Action)
	}
	if e.ID == "" {
		e.ID = uuid.NewString()
	}
	if len(e.ID) > 128 {
		return fmt.Errorf("%w: id longer than 128 characters", ErrInvalidEvent)
	}
	if e.Outcome == "" {
		e.Outcome = OutcomeSuccess
	}
	if e.OccurredAt.IsZero() {
		e.OccurredAt = time.Now()
	}
	// Microseconds, because that is what a Postgres timestamptz keeps.
	// audit-trail hashes occurred_at into the chain; a nanosecond value would
	// hash one way on insert and another when re-read, and the chain would
	// fail its own verification.
	e.OccurredAt = e.OccurredAt.UTC().Truncate(time.Microsecond)

	// Request context the caller did not fill explicitly. Roles are taken
	// from the request only when the caller named none: a service that
	// computed the roles that actually authorised the action knows better
	// than a header does.
	r := RequestFrom(ctx)
	if e.RequestID == "" {
		e.RequestID = r.ID
	}
	if e.SourceIP == "" {
		e.SourceIP = r.SourceIP
	}
	if e.UserAgent == "" {
		e.UserAgent = r.UserAgent
	}
	if len(e.ActorRoles) == 0 && len(r.Roles) > 0 {
		e.ActorRoles = append([]string(nil), r.Roles...)
	}
	return nil
}

// Payload is the JSON body POSTed to audit-trail.
func (e Event) Payload() ([]byte, error) {
	type wire Event
	return json.Marshal(struct {
		wire
		OccurredAt string `json:"occurred_at"`
	}{wire: wire(e), OccurredAt: e.OccurredAt.UTC().Format(time.RFC3339Nano)})
}

// ---------------------------------------------------------------------------
// Request context
// ---------------------------------------------------------------------------

// Request is what a producer knows about the HTTP request behind an action.
// It rides on the context so the layer that writes the outbox row (a
// repository, several calls below the handler) can attach it without every
// signature in between growing four parameters.
type Request struct {
	ID        string
	SourceIP  string
	UserAgent string
	Roles     []string
}

type requestKey struct{}

// WithRequest returns ctx carrying r.
func WithRequest(ctx context.Context, r Request) context.Context {
	return context.WithValue(ctx, requestKey{}, r)
}

// RequestFrom returns the Request on ctx, or the zero value. It also reads a
// fasthttp *RequestCtx, whose Value(key) is its user-value store — that is
// what fiber's c.Context() returns, and what most handlers here pass down.
func RequestFrom(ctx context.Context) Request {
	if ctx == nil {
		return Request{}
	}
	if r, ok := ctx.Value(requestKey{}).(Request); ok {
		return r
	}
	return Request{}
}
