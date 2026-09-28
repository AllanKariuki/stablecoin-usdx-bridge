package reconciliation

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"math/big"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"

	"github.com/google/uuid"
)

// SupplySource is a live read of a chain's total supply. It stays an
// interface, and stays optional, because P3 gives the job a better answer:
// services/indexer writes eth/sol_supply_snapshot from a process whose whole
// job is being right about chain state, and reading that costs no RPC call
// and cannot fail a run because an endpoint was having a bad minute.
type SupplySource interface {
	TotalSupply() (*big.Int, uint64, error)
}

// Job re-proves, on demand, that the three records of the same money agree.
//
//	Leg A  ledger says issued  ==  on-chain supply + in transit
//	Leg B  reserve backing     ==  ledger says issued        (the 1:1 peg)
//	Leg C  custodian statement >=  ledger says is in the bank
//
// Leg A catches a chain event the ledger missed or invented. Leg B catches
// USD-X issued without fiat behind it. Leg C catches the ledger and the bank
// disagreeing about cash. A two-way check would fold all three into one number
// and tell you only that something, somewhere, was off.
//
// What changed in P3 is not the arithmetic — it is that a run is now a row, a
// break is a row with a lifetime, and a break emits a metric and an event
// instead of a log line. The control that catches an unbacked mint was
// decorative while its only output was log.Printf on one of N replicas.
type Job struct {
	repo   *ledger.Repository
	eth    SupplySource
	sol    SupplySource
	logger *slog.Logger
	sink   Sink

	// PreferSnapshots reads chain supply from the indexer's snapshots instead
	// of calling the chains directly. Off when no indexer is deployed.
	PreferSnapshots bool

	// SnapshotMaxAge is how stale an indexer snapshot may be before the job
	// stops trusting it and falls back to a live RPC read. An indexer that
	// stopped advancing would otherwise make every leg pass forever against a
	// frozen number — the exact failure mode a reconciliation job exists to
	// not have.
	SnapshotMaxAge time.Duration
}

func NewJob(repo *ledger.Repository, eth, sol SupplySource, logger *slog.Logger, sink Sink) *Job {
	if sink == nil {
		sink = NopSink{}
	}
	return &Job{
		repo:           repo,
		eth:            eth,
		sol:            sol,
		logger:         logger,
		sink:           sink,
		SnapshotMaxAge: 10 * time.Minute,
	}
}

// Report is what one run observed. It is returned as well as persisted so the
// `reconcile --once` command can set its exit code from it — a CronJob whose
// pod always exits 0 tells an operator nothing.
type Report struct {
	RunID  string
	Status string

	LegA *LegAResult
	LegB *LegBResult
	LegC *LegCResult

	Opened   []ledger.ReconciliationBreak
	Resolved []ledger.ReconciliationBreak
	Err      error
}

func (r Report) Healthy() bool { return r.Status == ledger.RunOK }

// Break codes. They are part of the alert contract — a runbook is written
// against these strings — so they are constants rather than formatted text.
const (
	LegAName = "LEG_A"
	LegBName = "LEG_B"
	LegCName = "LEG_C"

	CodeLedgerChainDrift   = "LEDGER_CHAIN_DRIFT"
	CodePegBroken          = "PEG_BROKEN"
	CodeCustodianShortfall = "CUSTODIAN_SHORTFALL"
)

// Run performs one reconciliation and records it.
//
// Every exit path writes a run row, including the error path: "the check could
// not be performed" is itself a fact about the platform, and a gap in the run
// history that looks identical to a gap caused by nobody scheduling the job is
// worse than a row saying ERROR.
func (j *Job) Run(ctx context.Context, triggeredBy string) Report {
	run := &ledger.ReconciliationRun{
		ID:          uuid.New().String(),
		StartedAt:   time.Now().UTC(),
		Status:      ledger.RunError,
		TriggeredBy: triggeredBy,
	}
	report := Report{RunID: run.ID, Status: ledger.RunError}

	finish := func() Report {
		now := time.Now().UTC()
		run.FinishedAt = &now
		run.Status = report.Status
		run.BreakCount = len(report.Opened)
		if report.Err != nil {
			run.Error = report.Err.Error()
		}
		if err := j.repo.SaveReconciliationRun(ctx, run); err != nil {
			j.logger.Error("could not persist the reconciliation run", slog.Any("error", err))
		}
		j.sink.ObserveRun(ctx, report)
		return report
	}

	// The run row is written before any of the work, so a process killed
	// mid-run leaves a started-but-unfinished row rather than no trace.
	if err := j.repo.SaveReconciliationRun(ctx, run); err != nil {
		report.Err = fmt.Errorf("opening the reconciliation run: %w", err)
		return report
	}

	ethSupply, solSupply, err := j.chainSupply(ctx)
	if err != nil {
		report.Err = err
		return finish()
	}
	run.EthSupply, run.SolSupply = ethSupply, solSupply

	issued, err := j.repo.BalanceByGLCode(ctx, ledger.GLCirculation)
	if err != nil {
		report.Err = fmt.Errorf("reading USD-X in circulation: %w", err)
		return finish()
	}
	inTransit, err := j.repo.BalanceByGLCode(ctx, ledger.GLBridgeSuspense)
	if err != nil {
		report.Err = fmt.Errorf("reading the bridge suspense balance: %w", err)
		return finish()
	}
	run.Issued, run.InTransit = issued, inTransit

	backing, err := j.repo.BalanceByGLCode(ctx, ledger.GLReserveBacking(ledger.PegCurrency))
	if err != nil {
		report.Err = fmt.Errorf("reading reserve backing: %w", err)
		return finish()
	}
	run.Backing = backing
	backingAsUSDX, err := j.pegScale(ctx, backing)
	if err != nil {
		report.Err = err
		return finish()
	}

	ledgerCash, err := j.repo.BalanceByGLCode(ctx, ledger.GLTrustBank(ledger.PegCurrency))
	if err != nil {
		report.Err = fmt.Errorf("reading cash at custodian: %w", err)
		return finish()
	}
	run.LedgerCash = ledgerCash

	// ---- the three legs -------------------------------------------------
	legA := CheckLegA(issued, inTransit, ethSupply, solSupply)
	report.LegA = &legA
	run.LegAOK = boolPtr(legA.OK())

	legB := CheckLegB(backing, backingAsUSDX, issued)
	report.LegB = &legB
	run.LegBOK = boolPtr(legB.OK())

	bankBalance, bankAsOf, cerr := j.repo.CustodianBalance(ctx, ledger.PegCurrency)
	switch {
	case errors.Is(cerr, ledger.ErrNoTrustBankSnapshot):
		// Leg C stays unevaluated rather than passing. Nobody has told us what
		// the bank holds, and "we didn't look" must never render as green.
		j.logger.Warn("Leg C skipped: no custodian has reported a balance yet",
			slog.String("run_id", run.ID))
	case cerr != nil:
		report.Err = fmt.Errorf("reading the custodian balance: %w", cerr)
		return finish()
	default:
		run.BankBalance, run.BankAsOf = bankBalance, &bankAsOf
		legC := CheckLegC(bankBalance, ledgerCash, bankAsOf)
		report.LegC = &legC
		run.LegCOK = boolPtr(legC.OK())
	}

	// ---- record what broke ----------------------------------------------
	stillOpen := map[string]bool{}
	record := func(leg, code, detail string, drift *big.Int) {
		stillOpen[leg+":"+code] = true
		b := &ledger.ReconciliationBreak{
			Leg: leg, Code: code, Detail: detail,
			OpenedRunID: run.ID, LastRunID: run.ID, Drift: drift,
		}
		opened, err := j.repo.OpenOrUpdateBreak(ctx, b)
		if err != nil {
			j.logger.Error("could not record a reconciliation break",
				slog.String("leg", leg), slog.String("code", code), slog.Any("error", err))
			return
		}
		if opened {
			report.Opened = append(report.Opened, *b)
			j.sink.BreakOpened(ctx, *b)
		}
		j.logger.Error("reconciliation break",
			slog.String("run_id", run.ID), slog.String("leg", leg),
			slog.String("code", code), slog.String("drift", drift.String()),
			slog.Bool("newly_opened", opened), slog.String("detail", detail))
	}

	if !legA.OK() {
		record(LegAName, CodeLedgerChainDrift, legA.Detail(), legA.Drift)
	}
	if !legB.OK() {
		record(LegBName, CodePegBroken, legB.Detail(), legB.Drift)
	}
	if report.LegC != nil && !report.LegC.OK() {
		record(LegCName, CodeCustodianShortfall, report.LegC.Detail(), report.LegC.Drift)
	}

	resolved, err := j.repo.ResolveBreaks(ctx, run.ID, stillOpen)
	if err != nil {
		j.logger.Error("could not auto-resolve healed breaks", slog.Any("error", err))
	}
	for _, b := range resolved {
		report.Resolved = append(report.Resolved, b)
		j.sink.BreakResolved(ctx, b)
		j.logger.Info("reconciliation break resolved",
			slog.String("run_id", run.ID), slog.String("leg", b.Leg),
			slog.String("code", b.Code), slog.Int("observations", b.Observations),
			slog.Duration("open_for", time.Since(b.OpenedAt)))
	}

	if len(stillOpen) > 0 {
		report.Status = ledger.RunBreaks
	} else {
		report.Status = ledger.RunOK
		j.logger.Info("reconciliation OK",
			slog.String("run_id", run.ID),
			slog.String("issued", issued.String()),
			slog.String("on_chain", legA.OnChain.String()),
			slog.String("in_transit", inTransit.String()),
			slog.String("backing", backing.String()),
			slog.String("ledger_cash", ledgerCash.String()))
	}
	return finish()
}

// chainSupply prefers the indexer's snapshots and falls back to a live read.
//
// The fallback is not a nicety: an indexer that has stopped advancing leaves
// a snapshot that is perfectly well-formed and increasingly wrong, and a
// reconciliation job that keeps passing against it is worse than one that
// fails, because it is actively reassuring. SnapshotMaxAge is where that is
// caught.
func (j *Job) chainSupply(ctx context.Context) (eth, sol *big.Int, err error) {
	read := func(chain string, live SupplySource) (*big.Int, error) {
		if j.PreferSnapshots {
			supply, height, capturedAt, serr := j.repo.LatestChainSupply(ctx, chain)
			switch {
			case serr == nil && time.Since(capturedAt) <= j.SnapshotMaxAge:
				return supply, nil
			case serr == nil:
				j.logger.Warn("indexer snapshot is stale; falling back to a live chain read",
					slog.String("chain", chain),
					slog.Uint64("height", height),
					slog.Time("captured_at", capturedAt))
			default:
				j.logger.Warn("no indexer snapshot yet; falling back to a live chain read",
					slog.String("chain", chain), slog.Any("error", serr))
			}
		}
		if live == nil {
			return nil, fmt.Errorf("no supply source for %s: the indexer has no usable snapshot and no chain client is configured", chain)
		}
		supply, _, lerr := live.TotalSupply()
		return supply, lerr
	}

	if eth, err = read("ETHEREUM", j.eth); err != nil {
		return nil, nil, fmt.Errorf("reading Ethereum supply: %w", err)
	}
	if sol, err = read("SOLANA", j.sol); err != nil {
		return nil, nil, fmt.Errorf("reading Solana supply: %w", err)
	}
	return eth, sol, nil
}

// pegScale restates a USD amount in USD-X's smallest units at the 1:1 peg —
// the two differ only by decimal scale (2 vs 6), which is exactly what
// ledger.Convert exists to handle.
func (j *Job) pegScale(ctx context.Context, usd *big.Int) (*big.Int, error) {
	from, err := j.repo.Currency(ctx, ledger.PegCurrency)
	if err != nil {
		return nil, err
	}
	to, err := j.repo.Currency(ctx, ledger.USDXCode)
	if err != nil {
		return nil, err
	}
	return ledger.Convert(ledger.PegQuote(from.Code, to.Code), usd, *from, *to).Gross, nil
}

func boolPtr(b bool) *bool { return &b }
