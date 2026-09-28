// Package tailer is the chain-agnostic half of indexing: advance a cursor,
// detect a fork, orphan what the chain no longer believes, and record what it
// does.
//
// Everything chain-specific — how to read a header, how to decode a log, what
// "total supply" means — sits behind Source, so Ethereum and Solana share one
// piece of reorg logic instead of two subtly different ones.
package tailer

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/reorg"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"
)

// Source is one chain, as far as the indexer is concerned.
type Source interface {
	// Chain is the name core-ledger uses: ETHEREUM or SOLANA.
	Chain() string

	// Head is the chain's current height. For Ethereum that is the latest
	// block number; for Solana, the latest confirmed slot.
	Head(ctx context.Context) (uint64, error)

	// HeaderAt returns a single header. Only the reorg walk calls it, so a
	// chain whose headers are expensive to fetch pays that cost only when
	// something has actually gone wrong.
	HeaderAt(ctx context.Context, height uint64) (reorg.Header, error)

	// Events returns everything the indexer cares about in [from, to],
	// inclusive, already decoded.
	Events(ctx context.Context, from, to uint64) ([]store.Event, error)

	// TotalSupply is USD-X's supply on this chain, in USD-X smallest units,
	// as of the returned height.
	TotalSupply(ctx context.Context) (*big.Int, uint64, error)
}

// Records is the slice of the indexer's database this loop touches.
//
// It is an interface rather than *store.Store so the loop — which is where
// R9's mitigation actually lives — can be tested against a fabricated fork
// with no database at all. A reorg test that needs a running Postgres is a
// reorg test that gets skipped.
type Records interface {
	Cursor(ctx context.Context, chain string) (height uint64, hash string, err error)
	SetCursor(ctx context.Context, chain string, height uint64, hash string) error
	CanonicalHashAt(ctx context.Context, chain string, height uint64) (string, bool, error)
	Orphan(ctx context.Context, chain string, above uint64) (blocks, events int64, err error)
	PutEvents(ctx context.Context, events []store.Event) error
	PutBlock(ctx context.Context, b store.Block) error
	PruneBlocks(ctx context.Context, chain string, below uint64) error
}

// Observer is told what a pass did. It is how supply reporting, metrics and
// correction events hang off the loop without the loop importing any of them.
type Observer interface {
	// Reorged fires once per detected fork, after the orphaning has been
	// committed. A consumer that acted on an orphaned mint learns about it
	// here — which is the whole of R9's mitigation on the consumer side.
	Reorged(ctx context.Context, chain string, ancestor, depth uint64, orphanedEvents int64)
	// Advanced fires once per successful pass, whether or not it found
	// anything.
	Advanced(ctx context.Context, chain string, from, to, head uint64, events int)
}

type NopObserver struct{}

func (NopObserver) Reorged(context.Context, string, uint64, uint64, int64) {}
func (NopObserver) Advanced(context.Context, string, uint64, uint64, uint64, int) {
}

type Config struct {
	// Confirmations is how far behind the head the indexer stays. Nothing is
	// recorded as canonical until it is this deep, which is what makes a
	// routine tip reorg invisible to consumers rather than a correction they
	// have to handle.
	Confirmations uint64

	// ReorgDepth is how many headers are kept for fork resolution. A fork
	// deeper than this is refused rather than absorbed (see reorg.ErrDeepReorg)
	// — rewriting history the platform has already minted against is not a
	// correction, it is a fabrication.
	ReorgDepth uint64

	// BatchSize bounds one pass, so catching up across a long outage happens
	// in steady increments instead of one query an RPC provider will refuse.
	BatchSize uint64

	// StartHeight is where a cold cursor begins. Zero means "the head minus
	// Confirmations" — indexing an entire chain from genesis to find a
	// contract deployed last month is a week of RPC calls for nothing.
	StartHeight uint64

	Interval time.Duration
}

func DefaultConfig() Config {
	return Config{
		Confirmations: 12,
		ReorgDepth:    128,
		BatchSize:     2000,
		Interval:      5 * time.Second,
	}
}

type Tailer struct {
	src    Source
	store  Records
	logger *slog.Logger
	obs    Observer
	cfg    Config
}

func New(src Source, st Records, logger *slog.Logger, obs Observer, cfg Config) *Tailer {
	if obs == nil {
		obs = NopObserver{}
	}
	return &Tailer{src: src, store: st, logger: logger.With(slog.String("chain", src.Chain())), obs: obs, cfg: cfg}
}

func (t *Tailer) Run(ctx context.Context) {
	ticker := time.NewTicker(t.cfg.Interval)
	defer ticker.Stop()

	t.logger.Info("tailing chain",
		slog.Uint64("confirmations", t.cfg.Confirmations),
		slog.Uint64("reorg_depth", t.cfg.ReorgDepth))

	for {
		select {
		case <-ctx.Done():
			t.logger.Info("stopped tailing")
			return
		case <-ticker.C:
			if err := t.Once(ctx); err != nil {
				if errors.Is(err, context.Canceled) {
					return
				}
				t.logger.Error("index pass failed", slog.Any("error", err))
			}
		}
	}
}

// Once advances the cursor by at most one batch.
//
// The order of operations is the whole design and is not interchangeable:
//
//  1. read the head and compute a safe height (head − confirmations);
//  2. check the *first* block of the new range against what we stored, and
//     rewind before reading anything if it disagrees;
//  3. read events, write events, write headers;
//  4. only then move the cursor.
//
// A crash anywhere re-runs the range, and every write in step 3 is an upsert
// keyed by something the chain owns, so re-running is a no-op. Moving the
// cursor first would make a crash skip a range silently, which for a mint
// event means a ledger that never learns money was created.
func (t *Tailer) Once(ctx context.Context) error {
	chain := t.src.Chain()

	head, err := t.src.Head(ctx)
	if err != nil {
		return fmt.Errorf("reading the head: %w", err)
	}
	safe := reorg.Floor(head, t.cfg.Confirmations)
	if safe == 0 {
		return nil // a chain younger than the confirmation depth has nothing settled yet
	}

	cursor, _, err := t.store.Cursor(ctx, chain)
	if err != nil {
		return fmt.Errorf("reading the cursor: %w", err)
	}
	if cursor == 0 {
		cursor = t.coldStart(safe)
		t.logger.Info("cold start", slog.Uint64("from", cursor), slog.Uint64("safe_head", safe))
	}
	if cursor >= safe {
		t.obs.Advanced(ctx, chain, cursor, cursor, head, 0)
		return nil
	}

	from := cursor + 1
	floor := reorg.Floor(safe, t.cfg.ReorgDepth)

	// --- 2. fork check ---------------------------------------------------
	incoming, err := t.src.HeaderAt(ctx, from)
	if err != nil {
		return fmt.Errorf("reading header %d: %w", from, err)
	}
	decision, err := reorg.Check(
		func(h uint64) (string, bool) {
			hash, ok, kerr := t.store.CanonicalHashAt(ctx, chain, h)
			if kerr != nil {
				t.logger.Error("reading a stored block hash", slog.Uint64("height", h), slog.Any("error", kerr))
				return "", false
			}
			return hash, ok
		},
		func(h uint64) (reorg.Header, error) { return t.src.HeaderAt(ctx, h) },
		incoming, floor)
	if err != nil {
		// A deep reorg stops this chain's tailer rather than guessing. The
		// cursor stays put, the metric stops advancing, and the staleness
		// alert fires — which is the correct outcome for an event that should
		// wake a human.
		return fmt.Errorf("resolving a possible reorg at %d: %w", from, err)
	}

	if decision.Fork {
		blocks, events, oerr := t.store.Orphan(ctx, chain, decision.Ancestor)
		if oerr != nil {
			return fmt.Errorf("orphaning above %d: %w", decision.Ancestor, oerr)
		}
		t.logger.Warn("chain reorganised; orphaned what it no longer believes",
			slog.Uint64("ancestor", decision.Ancestor),
			slog.Uint64("depth", decision.Depth),
			slog.Int64("orphaned_blocks", blocks),
			slog.Int64("orphaned_events", events))
		t.obs.Reorged(ctx, chain, decision.Ancestor, decision.Depth, events)

		// Re-read from just after the common ancestor. Everything between
		// there and the old cursor is now a different chain.
		if err := t.store.SetCursor(ctx, chain, decision.Ancestor, ""); err != nil {
			return err
		}
		from = decision.Ancestor + 1
	}

	to := from + t.cfg.BatchSize - 1
	if to > safe {
		to = safe
	}

	// --- 3. read and write -----------------------------------------------
	events, err := t.src.Events(ctx, from, to)
	if err != nil {
		return fmt.Errorf("reading events %d..%d: %w", from, to, err)
	}
	if err := t.store.PutEvents(ctx, events); err != nil {
		return err
	}

	// Record the headers of the range's tail — only what the reorg window
	// needs, not every block. Indexing a chain's entire header history to
	// resolve forks that are refused beyond 128 blocks would be storing
	// millions of rows to answer a question that is never asked.
	headerFrom := from
	if to > t.cfg.ReorgDepth && to-t.cfg.ReorgDepth > headerFrom {
		headerFrom = to - t.cfg.ReorgDepth
	}
	var tipHash string
	for h := headerFrom; h <= to; h++ {
		hdr, herr := t.src.HeaderAt(ctx, h)
		if herr != nil {
			return fmt.Errorf("reading header %d: %w", h, herr)
		}
		if err := t.store.PutBlock(ctx, store.Block{
			Chain: chain, Height: h, Hash: hdr.Hash, ParentHash: hdr.ParentHash,
		}); err != nil {
			return err
		}
		tipHash = hdr.Hash
	}

	// --- 4. advance ------------------------------------------------------
	if err := t.store.SetCursor(ctx, chain, to, tipHash); err != nil {
		return err
	}
	if err := t.store.PruneBlocks(ctx, chain, reorg.Floor(to, t.cfg.ReorgDepth*2)); err != nil {
		t.logger.Warn("could not prune old headers", slog.Any("error", err))
	}

	t.obs.Advanced(ctx, chain, from, to, head, len(events))
	if len(events) > 0 {
		t.logger.Info("indexed",
			slog.Uint64("from", from), slog.Uint64("to", to),
			slog.Int("events", len(events)), slog.Uint64("head", head))
	}
	return nil
}

func (t *Tailer) coldStart(safe uint64) uint64 {
	if t.cfg.StartHeight > 0 {
		return t.cfg.StartHeight - 1
	}
	// One reorg window back from the safe head: enough that the very first
	// pass has headers to compare against, without walking a chain's history.
	return reorg.Floor(safe, t.cfg.ReorgDepth)
}
