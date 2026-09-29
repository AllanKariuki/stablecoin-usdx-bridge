// Package anchor turns a window of audit events into a Merkle root, and
// publishes it somewhere this platform does not control.
//
// The hash chain already proves nothing was removed. What it cannot prove is
// *when* a row was written: somebody with database access can rewrite the
// chain from any point and produce a log that verifies perfectly. Publishing
// a root externally fixes everything it covers as of that moment — after
// which no rewrite of those hours can produce that root.
//
// That is the whole differentiator the plan names: *"hash-chained rows +
// hourly Merkle anchors, optionally written on-chain via signer — a real
// differentiator for a regulated stablecoin."*
package anchor

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/chain"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/store"
)

// Publisher puts a root somewhere outside this platform's control.
//
// It is an interface with a deliberately unglamorous default, because the
// *computation* of the anchor is the part that must be right and the
// publication is a transport. A deployment with no publisher still computes
// and stores every root, so publishing later is possible — an unpublished
// root is a weaker guarantee, not a lost one.
type Publisher interface {
	Name() string
	Publish(ctx context.Context, anchorID, merkleRoot string) (txHash string, err error)
}

// Service computes anchors on an interval.
type Service struct {
	store     *store.Store
	publisher Publisher
	logger    *slog.Logger

	// Interval is how often a window is closed. Hourly by the plan, and the
	// trade is visible: a shorter window means an event becomes externally
	// provable sooner and costs more transactions; a longer one is cheaper
	// and leaves a bigger tail of events provable only by the internal chain.
	Interval time.Duration

	// MinEvents stops an anchor being written for an empty or near-empty
	// hour. Publishing a root over two events costs the same as one over ten
	// thousand, and a quiet platform would otherwise spend its anchoring
	// budget on nothing.
	MinEvents int

	// MaxEvents bounds one anchor's window, so a backlog after an outage is
	// anchored in several trees rather than one enormous one — a proof
	// against a million-leaf tree is still only twenty hashes, but building
	// it reads a million rows.
	MaxEvents int
}

func New(st *store.Store, publisher Publisher, logger *slog.Logger) *Service {
	return &Service{
		store:     st,
		publisher: publisher,
		logger:    logger,
		Interval:  time.Hour,
		MinEvents: 1,
		MaxEvents: 50_000,
	}
}

func (s *Service) Run(ctx context.Context) {
	ticker := time.NewTicker(s.Interval)
	defer ticker.Stop()

	s.logger.Info("anchoring audit events", slog.Duration("every", s.Interval))
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if _, err := s.Once(ctx); err != nil {
				s.logger.Error("anchoring pass failed", slog.Any("error", err))
			}
			s.publishPending(ctx)
		}
	}
}

// Once closes one window: computes the root, stores it, and publishes.
func (s *Service) Once(ctx context.Context) (*store.Anchor, error) {
	events, err := s.store.Unanchored(ctx, s.MaxEvents)
	if err != nil {
		return nil, fmt.Errorf("reading unanchored events: %w", err)
	}
	if len(events) < s.MinEvents {
		return nil, nil
	}

	leaves := make([][32]byte, len(events))
	for i, e := range events {
		// The same canonical bytes the hash chain covers, so one anchor pins
		// both structures: a root proves the *content*, and the chain tip
		// stored alongside it proves the ordering.
		leaves[i] = chain.HashLeaf(e.CanonicalBytes())
	}

	anchor := &store.Anchor{
		FromSeq:    events[0].Seq,
		ToSeq:      events[len(events)-1].Seq,
		EventCount: len(events),
		MerkleRoot: chain.Hex(chain.Root(leaves)),
		ChainTip:   events[len(events)-1].Hash,
		Status:     "PENDING",
	}
	if s.publisher == nil {
		// Honest rather than silent. The root is still computed and stored,
		// so it can be published later — an unpublished anchor is a weaker
		// guarantee, not a lost one, and calling it SKIPPED says exactly
		// that.
		anchor.Status = "SKIPPED"
	}

	if err := s.store.CreateAnchor(ctx, anchor); err != nil {
		return nil, fmt.Errorf("storing the anchor: %w", err)
	}
	s.logger.Info("anchored audit events",
		slog.String("anchor_id", anchor.ID),
		slog.Int("events", anchor.EventCount),
		slog.Int64("from_seq", anchor.FromSeq),
		slog.Int64("to_seq", anchor.ToSeq),
		slog.String("merkle_root", anchor.MerkleRoot),
		slog.String("status", anchor.Status))

	if s.publisher != nil {
		s.publish(ctx, *anchor)
	}
	return anchor, nil
}

// publishPending retries anchors whose publication failed.
//
// Separate from Once because the two fail for unrelated reasons: computing a
// root fails if the database is unreachable, publishing fails if a chain is.
// Retrying them together would mean a chain outage stopped new windows from
// being closed, and the roots are what matter — publication can catch up.
func (s *Service) publishPending(ctx context.Context) {
	if s.publisher == nil {
		return
	}
	pending, err := s.store.PendingAnchors(ctx)
	if err != nil {
		s.logger.Error("reading pending anchors", slog.Any("error", err))
		return
	}
	for _, a := range pending {
		s.publish(ctx, a)
	}
}

func (s *Service) publish(ctx context.Context, a store.Anchor) {
	txHash, err := s.publisher.Publish(ctx, a.ID, a.MerkleRoot)
	if err != nil {
		if merr := s.store.MarkAnchorFailed(ctx, a.ID, err.Error()); merr != nil {
			s.logger.Error("could not record an anchor failure", slog.Any("error", merr))
		}
		s.logger.Warn("could not publish an anchor; the root is stored and will be retried",
			slog.String("anchor_id", a.ID), slog.Any("error", err))
		return
	}
	if err := s.store.MarkAnchorPublished(ctx, a.ID, s.publisher.Name(), txHash); err != nil {
		s.logger.Error("published an anchor but could not record it",
			slog.String("anchor_id", a.ID), slog.String("tx_hash", txHash), slog.Any("error", err))
		return
	}
	s.logger.Info("anchor published",
		slog.String("anchor_id", a.ID),
		slog.String("chain", s.publisher.Name()),
		slog.String("tx_hash", txHash))
}
