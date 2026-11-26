// Package enforcement sweeps chain_enforcements to finality.
//
// POST /chain/enforcement broadcasts the transaction and returns 202; the
// row it recorded is SUBMITTED with a hash. This sweep — running inside
// cmd/worker, the process that already drains durable queues — is what
// watches each row until the chain answers: FINAL once the transaction
// reaches the configured depth, FAILED when it landed and reverted, and
// FAILED with a clear reason when the chain never answers within the budget.
// Every terminal transition enqueues the outbox event compliance consumes
// (ledger.EventChainEnforcementFinalized) in the same transaction.
//
// The claim is the saga queue's shape: FOR UPDATE SKIP LOCKED, with
// next_check_at pushed forward by the lease so a sweep that dies releases
// its rows when they lapse. Each check is one immediate RPC call —
// FinalityStatus never polls — because a sweep must not park goroutines on a
// 15-minute finality window; the ticker is its patience.
package enforcement

import (
	"context"
	"errors"
	"log/slog"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
)

type Config struct {
	// PollInterval is how often the sweep looks for due rows.
	PollInterval time.Duration
	// Lease is how long a claimed row is held before another sweep may take
	// it. Each check is one RPC call, so this is crash detection, not work.
	Lease time.Duration
	// BatchSize bounds how many rows one pass claims.
	BatchSize int
	// MaxAttempts is the budget for "the chain never answers". Each attempt
	// is one immediate check; at the default 10s interval a 2-hour budget is
	// 720 attempts, and the last word is a FAILED row, never a silent one.
	MaxAttempts int
}

func DefaultConfig() Config {
	return Config{
		PollInterval: 10 * time.Second,
		Lease:        30 * time.Second,
		BatchSize:    10,
		MaxAttempts:  720, // ~2 hours at the default interval
	}
}

type Sweep struct {
	repo   *ledger.Repository
	router *bridge.Router
	logger *slog.Logger
	cfg    Config
}

func NewSweep(repo *ledger.Repository, router *bridge.Router, logger *slog.Logger, cfg Config) *Sweep {
	return &Sweep{repo: repo, router: router, logger: logger, cfg: cfg}
}

// Run claims due rows until ctx is cancelled. It never fails the loop: a
// broken claim or a transient RPC error costs one interval, and the rows
// stay claimed-or-due for the next pass.
func (s *Sweep) Run(ctx context.Context) {
	ticker := time.NewTicker(s.cfg.PollInterval)
	defer ticker.Stop()

	s.logger.Info("enforcement finality sweep started",
		slog.Duration("interval", s.cfg.PollInterval),
		slog.Int("max_attempts", s.cfg.MaxAttempts))

	for {
		select {
		case <-ctx.Done():
			s.logger.Info("enforcement finality sweep stopped")
			return
		case <-ticker.C:
			s.RunOnce(ctx)
		}
	}
}

// RunOnce claims one batch and checks each row exactly once. Split out of Run
// so the sweep is testable without a ticker.
func (s *Sweep) RunOnce(ctx context.Context) {
	rows, err := s.repo.ClaimChainEnforcements(ctx, s.cfg.BatchSize, s.cfg.Lease)
	if err != nil {
		if ctx.Err() == nil {
			s.logger.Error("claiming enforcement rows failed", slog.Any("error", err))
		}
		return
	}
	for i := range rows {
		s.check(ctx, &rows[i])
	}
}

// check asks the chain one immediate question and applies the answer.
func (s *Sweep) check(ctx context.Context, row *ledger.ChainEnforcement) {
	log := s.logger.With(
		slog.String("reference", row.Reference),
		slog.String("action", row.Action),
		slog.String("chain", row.Chain),
		slog.Int("attempt", row.Attempts))

	client, ok := s.router.Enforcer(row.Chain)
	if !ok {
		// The route validated the chain at submit time; a row for a chain the
		// router no longer serves is a configuration change mid-flight. Fail
		// it rather than reschedule it forever.
		if err := s.repo.FinalizeChainEnforcement(ctx, row.Reference, false,
			"chain "+row.Chain+" is no longer configured for enforcement"); err != nil {
			log.Error("could not fail an unservable enforcement row", slog.Any("error", err))
		}
		return
	}

	final, err := client.FinalityStatus(row.TxHash)
	switch {
	case err == nil && final:
		if ferr := s.repo.FinalizeChainEnforcement(ctx, row.Reference, true, ""); ferr != nil {
			log.Error("could not finalize the enforcement row", slog.Any("error", ferr))
			return
		}
		log.Info("enforcement transaction is final; compliance has been notified")

	case errors.Is(err, bridge.ErrTxFailedOnChain):
		reason := err.Error()
		if ferr := s.repo.FinalizeChainEnforcement(ctx, row.Reference, false, reason); ferr != nil {
			log.Error("could not fail the enforcement row", slog.Any("error", ferr))
			return
		}
		log.Warn("enforcement transaction failed on chain; compliance has been notified",
			slog.String("reason", reason))

	case err != nil && row.Attempts >= s.cfg.MaxAttempts:
		reason := "the chain never answered: " + err.Error()
		if ferr := s.repo.FinalizeChainEnforcement(ctx, row.Reference, false, reason); ferr != nil {
			log.Error("could not fail an unanswered enforcement row", slog.Any("error", ferr))
			return
		}
		log.Warn("enforcement transaction never answered; row failed",
			slog.String("reason", reason))

	case err == nil && !final && row.Attempts >= s.cfg.MaxAttempts:
		reason := "finality was not observed within the attempt budget (the transaction may still finalize; check the chain)"
		if ferr := s.repo.FinalizeChainEnforcement(ctx, row.Reference, false, reason); ferr != nil {
			log.Error("could not fail a never-final enforcement row", slog.Any("error", ferr))
			return
		}
		log.Warn("enforcement transaction never reached finality within the budget; row failed",
			slog.String("reason", reason))

	default:
		// Not final yet, or a transient RPC failure: the claim's lease already
		// pushed next_check_at forward, so the row is simply left for the next
		// due pass.
		if err != nil {
			log.Warn("enforcement finality check failed transiently", slog.Any("error", err))
		}
	}
}
