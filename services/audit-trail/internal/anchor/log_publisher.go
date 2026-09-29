package anchor

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
)

// LogPublisher writes the root to the service's own structured log.
//
// It is the default, and it is deliberately weak: a root in a log this
// platform controls proves nothing an attacker with that control could not
// also rewrite. Its value is operational — the roots appear in Loki, which is
// a different system with a different retention and a different set of people
// who can delete from it, so it raises the bar from "edit one table" to "edit
// one table and one log store".
//
// The real answer is an on-chain publisher: the same `bridgeMint`-style
// transaction through services/signer, writing 32 bytes to a contract.
// Deliberately not built here, because doing it properly means a contract to
// hold the roots, gas budgeting, and a policy rule in the signer — and a
// half-built version that silently no-ops would be worse than an honest
// SKIPPED.
type LogPublisher struct {
	logger *slog.Logger
}

func NewLogPublisher(logger *slog.Logger) *LogPublisher {
	return &LogPublisher{logger: logger}
}

func (p *LogPublisher) Name() string { return "log" }

func (p *LogPublisher) Publish(_ context.Context, anchorID, merkleRoot string) (string, error) {
	p.logger.Info("AUDIT ANCHOR",
		slog.String("anchor_id", anchorID),
		slog.String("merkle_root", merkleRoot),
		slog.String("note", "published to the service log; not an external witness"))

	// A deterministic pseudo-"tx hash" so the stored row has a reference that
	// can be grepped for. Marked with a prefix so nobody mistakes it for a
	// chain transaction.
	sum := sha256.Sum256([]byte("log:" + anchorID + merkleRoot))
	return "log:" + hex.EncodeToString(sum[:8]), nil
}
