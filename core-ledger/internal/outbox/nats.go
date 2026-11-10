package outbox

import (
	"context"
	"fmt"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// NATSPublisher is the P3 half of the Publisher seam.
//
// The seam was built in P2 against one HTTP endpoint on purpose: one producer
// and one consumer is not a reason to run a broker, and the outbox — not the
// bus — is what makes delivery durable. P3 is where it changes, because
// bridge_minted now has three independent consumers (the saga, compliance,
// notifications) at a rate the producer doesn't control, which is the exact
// situation a POST to one URL cannot serve without the producer knowing every
// consumer's address and retry behaviour.
//
// Domain code is untouched by the switch. The event type is already the
// subject: damp.<domain>.<event>.v1 was chosen in P2 for this moment.
type NATSPublisher struct {
	conn   *nats.Conn
	js     jetstream.JetStream
	stream string
}

// NewNATSPublisher connects and ensures the stream exists.
//
// Creating the stream here rather than in a provisioning script keeps a fresh
// environment to one `docker compose up`, and it is idempotent — a stream that
// already exists with the same subjects is updated in place, not recreated, so
// no message is ever dropped by a redeploy.
func NewNATSPublisher(ctx context.Context, url, stream string) (*NATSPublisher, error) {
	conn, err := nats.Connect(url,
		nats.Name("core-ledger-outbox-relay"),
		// The relay retries from the outbox anyway, so a reconnect storm is
		// harmless; what matters is that a NATS restart doesn't kill the relay
		// process and leave the queue draining nowhere.
		nats.MaxReconnects(-1),
		nats.ReconnectWait(2*time.Second),
	)
	if err != nil {
		return nil, fmt.Errorf("connecting to NATS at %s: %w", url, err)
	}

	js, err := jetstream.New(conn)
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("opening JetStream: %w", err)
	}

	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:     stream,
		Subjects: []string{"damp.>"},
		// File storage, and retention until every configured consumer has
		// acknowledged. A memory stream would make "the outbox guarantees
		// nothing is lost" true only up to the broker's next restart.
		Storage:   jetstream.FileStorage,
		Retention: jetstream.LimitsPolicy,
		MaxAge:    30 * 24 * time.Hour,
		// Publish deduplication over the Nats-Msg-Id the relay sets. The
		// outbox is at-least-once by design — a relay that dies between the
		// publish and MarkPublished re-delivers — so the window has to be
		// wider than the relay's own retry budget, which tops out around an
		// hour (see retry.Policy in NewRelay).
		Duplicates: 2 * time.Hour,
	})
	if err != nil {
		conn.Close()
		return nil, fmt.Errorf("ensuring JetStream stream %q: %w", stream, err)
	}

	return &NATSPublisher{conn: conn, js: js, stream: stream}, nil
}

func (p *NATSPublisher) Target() string {
	return fmt.Sprintf("nats:%s (stream %s)", p.conn.ConnectedUrl(), p.stream)
}

// Publish sends one event and waits for the broker's acknowledgement.
//
// Waiting is the point: an async publish would let the relay mark the row
// PUBLISHED on the strength of having handed bytes to a socket buffer, which
// is the one thing the outbox pattern exists to not do.
func (p *NATSPublisher) Publish(ctx context.Context, e Event) error {
	msg := &nats.Msg{
		Subject: e.EventType,
		Data:    []byte(e.Payload),
		Header:  nats.Header{},
	}
	msg.Header.Set("X-Event-Type", e.EventType)
	msg.Header.Set("X-Aggregate-Type", e.AggregateType)
	msg.Header.Set("X-Aggregate-Id", e.AggregateID)
	// JetStream dedupes on this within the stream's Duplicates window, which
	// turns the outbox's at-least-once into effectively-once for consumers
	// that can't dedupe themselves.
	msg.Header.Set(jetstream.MsgIDHeader, fmt.Sprintf("%s:%d", e.EventType, e.ID))

	if _, err := p.js.PublishMsg(ctx, msg); err != nil {
		return fmt.Errorf("publishing event %d to %s: %w", e.ID, e.EventType, err)
	}
	return nil
}

func (p *NATSPublisher) Close() {
	if p.conn != nil {
		// Drain rather than Close: anything already handed to the connection
		// finishes before the socket goes.
		_ = p.conn.Drain()
	}
}
