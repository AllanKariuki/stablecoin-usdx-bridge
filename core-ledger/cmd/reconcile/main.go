// Command reconcile proves, once, that the three records of the same money
// agree — and exits non-zero when they don't.
//
// It is its own binary because reconciliation used to be
// `go reconciliation.NewJob(...).RunForever()` inside cmd/server: a ticker
// with no context, no way to stop, and — the part that actually mattered —
// one copy per API replica. Three replicas meant three unsynchronised runs
// producing three sets of log lines about the same platform, and scaling the
// API up tripled the reconciliation load on the database for no extra
// assurance.
//
// As a CronJob with concurrencyPolicy: Forbid (infra/k8s/reconcile-cronjob.yaml)
// it runs exactly once per interval no matter how many API pods exist, its
// exit code is the schedule's own health signal, and the run it performed is a
// row somebody can read next quarter.
//
//	reconcile              # run once, exit 0 if balanced, 2 if broken, 1 on error
//	reconcile --watch 5m   # run on an interval (local dev; use the CronJob in k8s)
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/config"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/reconciliation"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
)

const serviceName = "core-ledger-reconcile"

// Exit codes are the contract with whatever schedules this. A CronJob that
// always exits 0 tells an operator nothing, and collapsing "broken" into
// "errored" would page the on-call for an RPC blip with the same urgency as a
// broken peg.
const (
	exitOK       = 0
	exitError    = 1 // the check could not be performed
	exitBreaking = 2 // the check was performed and something is wrong
)

func main() {
	watch := flag.Duration("watch", 0, "run repeatedly on this interval instead of once (local dev)")
	triggeredBy := flag.String("triggered-by", "cron", "recorded on the run row: cron | operator | ci")
	flag.Parse()

	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(exitError)
	}

	logger := platform.NewLogger(serviceName, cfg.LogLevel)
	slog.SetDefault(logger)

	repo, err := ledger.NewRepository(cfg.DatabaseURL)
	if err != nil {
		logger.Error("connecting to postgres", slog.Any("error", err))
		os.Exit(exitError)
	}

	// Chain clients are the *fallback* supply source, so a failure to dial them
	// is a warning rather than a boot failure: with an indexer deployed, the
	// snapshots in the ledger are the primary read and this job never needs to
	// touch an RPC endpoint at all.
	var eth, sol reconciliation.SupplySource
	clients, cerr := chainclients.Dial(logger, chainclients.Params{
		EthRPCURL:                cfg.EthRPCURL,
		USDXProxyAddress:         cfg.USDXProxyAddress,
		EthRelayerPrivKey:        cfg.EthRelayerPrivKey,
		SolanaRPCURL:             cfg.SolanaRPCURL,
		USDXProgramID:            cfg.USDXProgramID,
		USDXMintAddress:          cfg.USDXMintAddress,
		SolanaRelayerKeypairPath: cfg.SolanaRelayerKeypairPath,
	})
	if cerr != nil {
		logger.Warn("could not dial the chains; this run depends entirely on the indexer's snapshots",
			slog.Any("error", cerr))
	} else {
		eth, sol = clients.Ethereum, clients.Solana
	}

	metrics := reconciliation.NewMetrics()
	job := reconciliation.NewJob(repo, eth, sol, logger, reconciliation.NewOutboxSink(repo, metrics))
	job.PreferSnapshots = cfg.ReconcilePreferSnapshots
	job.SnapshotMaxAge = cfg.ReconcileSnapshotMaxAge

	// A one-shot run pushes its gauges to a Pushgateway if one is configured —
	// a pod that exits cannot be scraped, and a gauge nobody ever scrapes is
	// the same as no gauge. Without one, the run's own exit code and the
	// persisted row are the signal.
	push := reconciliation.NewPusher(cfg.PushgatewayURL, serviceName, metrics)

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	runOnce := func() int {
		report := job.Run(ctx, *triggeredBy)
		if err := push.Push(ctx); err != nil {
			logger.Warn("could not push reconciliation metrics", slog.Any("error", err))
		}
		switch {
		case report.Err != nil:
			logger.Error("reconciliation could not be performed",
				slog.String("run_id", report.RunID), slog.Any("error", report.Err))
			return exitError
		case !report.Healthy():
			logger.Error("reconciliation found breaks",
				slog.String("run_id", report.RunID),
				slog.Int("opened", len(report.Opened)))
			return exitBreaking
		default:
			return exitOK
		}
	}

	if *watch <= 0 {
		os.Exit(runOnce())
	}

	logger.Info("reconciling on an interval", slog.Duration("every", *watch))
	code := runOnce()
	ticker := time.NewTicker(*watch)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			os.Exit(code)
		case <-ticker.C:
			code = runOnce()
		}
	}
}
