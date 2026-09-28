// Package supply tells core-ledger what the chains hold.
//
// This is the writer eth_supply_snapshot and sol_supply_snapshot never had.
// Both tables have existed since core-ledger's first migration and nothing has
// ever inserted a row, which is why reconciliation's Leg A had to call an RPC
// endpoint from inside the API process on a 5-minute ticker — once per replica
// — and why a chain having a bad minute failed the one check that catches an
// unbacked mint.
package supply

import (
	"context"
	"log/slog"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"
)

// Source is the narrow half of tailer.Source this package needs.
type Source interface {
	Chain() string
	TotalSupply(ctx context.Context) (total *big.Int, height uint64, err error)
}

// Ledger is core-ledger's reserve endpoint.
type Ledger interface {
	// PostChainSupply takes supply in USD-X's smallest units; scaling it to
	// the decimal string the API parses is the client's job, not this
	// package's (see internal/ledgerclient).
	PostChainSupply(ctx context.Context, chain string, height uint64, blockHash string, totalSupply *big.Int) error
}

// Reporter reads supply, records it locally, then tells the ledger.
//
// The two steps are separate on purpose. Writing the reading down first is
// what makes an indexer that dies mid-report retry rather than skip a height,
// and a skipped supply snapshot is not a visible failure — it is a
// reconciliation that quietly compares against an older number and passes.
type Reporter struct {
	store   *store.Store
	ledger  Ledger
	logger  *slog.Logger
	sources []Source

	Interval time.Duration
}

func New(st *store.Store, ledger Ledger, logger *slog.Logger, sources ...Source) *Reporter {
	return &Reporter{store: st, ledger: ledger, logger: logger, sources: sources, Interval: 60 * time.Second}
}

func (r *Reporter) Run(ctx context.Context) {
	ticker := time.NewTicker(r.Interval)
	defer ticker.Stop()
	r.logger.Info("reporting chain supply to core-ledger", slog.Duration("every", r.Interval))

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			r.Once(ctx)
		}
	}
}

func (r *Reporter) Once(ctx context.Context) {
	for _, src := range r.sources {
		if err := r.capture(ctx, src); err != nil {
			r.logger.Error("could not capture chain supply",
				slog.String("chain", src.Chain()), slog.Any("error", err))
		}
	}
	r.drain(ctx)
}

func (r *Reporter) capture(ctx context.Context, src Source) error {
	total, height, err := src.TotalSupply(ctx)
	if err != nil {
		return err
	}
	return r.store.RecordSupply(ctx, store.SupplyReport{
		Chain:       src.Chain(),
		Height:      height,
		TotalSupply: total,
	})
}

// drain posts everything not yet acknowledged by the ledger.
//
// It walks the backlog rather than only the newest reading because the
// ledger's snapshot tables are keyed by height: a gap in them is a gap in the
// evidence trail, even though only the latest row is what Leg A compares
// against today.
func (r *Reporter) drain(ctx context.Context) {
	pending, err := r.store.UnpostedSupply(ctx, 20)
	if err != nil {
		r.logger.Error("could not read unposted supply reports", slog.Any("error", err))
		return
	}
	for _, p := range pending {
		err := r.ledger.PostChainSupply(ctx, p.Chain, p.Height, p.BlockHash, p.TotalSupply)
		if err != nil {
			if merr := r.store.MarkSupplyFailed(ctx, p.Chain, p.Height, err.Error()); merr != nil {
				r.logger.Error("could not record a supply post failure", slog.Any("error", merr))
			}
			r.logger.Warn("core-ledger rejected a supply snapshot; will retry",
				slog.String("chain", p.Chain), slog.Uint64("height", p.Height),
				slog.Int("attempts", p.Attempts+1), slog.Any("error", err))
			continue
		}
		if err := r.store.MarkSupplyPosted(ctx, p.Chain, p.Height); err != nil {
			r.logger.Error("posted a supply snapshot but could not mark it posted",
				slog.String("chain", p.Chain), slog.Uint64("height", p.Height), slog.Any("error", err))
		}
	}
}
