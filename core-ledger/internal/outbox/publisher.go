package outbox

import (
	"context"
	"log/slog"
)

// Choose picks the one destination the relay drains to.
//
// One relay, one destination, decided at boot — not a fan-out. A relay that
// published to both NATS and an HTTP endpoint would deliver every event twice
// to anything bridging between them, and would have to decide what "delivered"
// means when one succeeds and the other doesn't. If a second destination is
// ever genuinely wanted, it is a second consumer *of the bus*, which is what
// the bus is for.
//
// Returns nil when nothing is configured. That is a supported state, not a
// degraded one: events accumulate durably in the outbox and are delivered
// whenever a destination appears, which is the entire reason the table was
// built before there was anything to publish to.
func Choose(ctx context.Context, logger *slog.Logger, natsURL, natsStream, httpURL string) (Publisher, func()) {
	if natsURL != "" {
		p, err := NewNATSPublisher(ctx, natsURL, natsStream)
		if err != nil {
			// Not fatal. The ledger's job is to post journals correctly; a
			// broker that isn't up yet must not stop it, and the outbox is
			// exactly the thing that makes waiting safe.
			logger.Error("could not connect to NATS; events will accumulate in the outbox until it is reachable",
				slog.String("url", natsURL), slog.Any("error", err))
			return nil, func() {}
		}
		logger.Info("outbox publishing to NATS JetStream", slog.String("target", p.Target()))
		return p, p.Close
	}

	if httpURL != "" {
		logger.Info("outbox publishing over HTTP", slog.String("target", httpURL))
		return NewHTTPPublisher(httpURL), func() {}
	}

	logger.Info("outbox relay disabled (neither NATS_URL nor OUTBOX_RELAY_URL is set); events accumulate durably")
	return nil, func() {}
}
