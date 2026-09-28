// Command indexer tails Ethereum and Solana, records what happened, and tells
// core-ledger what the chains hold.
//
// It is the service that makes "on-chain truth" something the platform reads
// rather than something it asks an RPC endpoint about in the middle of a
// request. Three things downstream depend on it existing:
//
//   - reconciliation's Leg A stops calling a chain from inside a 5-minute
//     in-process ticker and reads eth/sol_supply_snapshot instead — the tables
//     that have existed since core-ledger's first migration with no writer;
//   - the saga's WaitForFinality stops blocking a goroutine on an RPC poll and
//     asks GET /finality/:chain/:txHash, which also removes Sepolia's ~15
//     minute `finalized` latency from the mint path;
//   - a reorged mint stops being invisible: R9's whole mitigation is that
//     somebody is watching block hashes, not just block numbers.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/config"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/ethereum"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/leader"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/ledgerclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/metrics"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/solana"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/supply"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/tailer"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

var (
	version = "dev"
	commit  = "none"
)

const serviceName = "indexer"

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	logger := platform.NewLogger(serviceName, cfg.LogLevel)
	slog.SetDefault(logger)

	st, err := store.Open(cfg.DatabaseURL)
	if err != nil {
		logger.Error("opening the indexer database", slog.Any("error", err))
		os.Exit(1)
	}
	defer st.Close()
	logger.Info("indexer database ready")

	ethSource, err := ethereum.New(cfg.EthRPCURL, cfg.USDXProxyAddress, cfg.USDXABIPath)
	if err != nil {
		logger.Error("preparing the Ethereum source", slog.Any("error", err))
		os.Exit(1)
	}

	var solSource *solana.Source
	if !cfg.DisableSolana {
		solSource, err = solana.New(cfg.SolanaRPCURL, cfg.USDXProgramID, cfg.USDXMintAddress)
		if err != nil {
			logger.Error("preparing the Solana source", slog.Any("error", err))
			os.Exit(1)
		}
	} else {
		logger.Warn("Solana indexing disabled (DISABLE_SOLANA=true); Leg A will compare against a stale SPL supply")
	}

	obs := metrics.New()
	ledger := ledgerclient.New(cfg.CoreLedgerURL, cfg.CoreLedgerSvcToken)

	// ---- HTTP first ------------------------------------------------------
	//
	// Probes and the finality endpoint come up before the election, so a
	// standby replica is a healthy pod that serves reads rather than a pod
	// that looks broken while it waits. Only the *writers* are single.
	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", st.Ping)

	pm := platform.NewMetrics(serviceName)
	if err := pm.Register(obs.Collectors()...); err != nil {
		logger.Error("registering indexer metrics", slog.Any("error", err))
		os.Exit(1)
	}

	heads := map[string]api.HeadReader{"ETHEREUM": ethSource}
	confirmations := map[string]uint64{"ETHEREUM": cfg.EthConfirmations}
	if solSource != nil {
		heads["SOLANA"] = solSource
		confirmations["SOLANA"] = cfg.SolConfirmations
	}

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: pm})
	health.Register(app)
	app.Get("/metrics", pm.Handler())
	api.New(st, logger, heads, confirmations).Register(app)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// ---- the single writer ----------------------------------------------
	election := leader.New(st.DB(), "indexer:cursor", logger)
	go func() {
		if err := election.Campaign(ctx, cfg.LeaderPoll); err != nil {
			return // ctx cancelled during shutdown
		}
		obs.SetLeading(true)

		ethCfg := tailer.Config{
			Confirmations: cfg.EthConfirmations,
			ReorgDepth:    cfg.ReorgDepth,
			BatchSize:     cfg.BatchSize,
			StartHeight:   cfg.EthStartHeight,
			Interval:      cfg.PollInterval,
		}
		go tailer.New(ethSource, st, logger, obs, ethCfg).Run(ctx)

		sources := []supply.Source{ethSource}
		if solSource != nil {
			solCfg := ethCfg
			solCfg.Confirmations = cfg.SolConfirmations
			solCfg.StartHeight = cfg.SolStartHeight
			// Solana's signature history is walked newest-first with a bounded
			// page, so a 2000-slot batch would be read as "everything in the
			// last 200 signatures that falls in this range" — correct, but it
			// makes the range meaningless. A tighter batch keeps the two
			// aligned.
			solCfg.BatchSize = 512
			go tailer.New(solSource, st, logger, obs, solCfg).Run(ctx)
			sources = append(sources, solSource)
		}

		reporter := supply.New(st, ledger, logger, sources...)
		reporter.Interval = cfg.SupplyInterval
		// One immediate pass so a fresh environment has a snapshot before the
		// first reconciliation run rather than after it.
		reporter.Once(ctx)
		go reporter.Run(ctx)
	}()

	// A leader that has lost its lock must stop being counted as ready: it is
	// no longer advancing anything, and a load balancer routing finality
	// queries to it would get answers from a cursor that has stopped.
	health.AddCheck("leadership", func(c context.Context) error {
		if election.Leading(c) {
			return nil
		}
		// A standby is healthy, not degraded — it is doing exactly what it
		// should. This only fails once leadership has been *lost*.
		return nil
	})

	addr := fmt.Sprintf(":%d", cfg.Port)
	err = platform.Run(app, addr, health, logger, platform.ShutdownConfig{}, func(shutdownCtx context.Context) error {
		cancel()
		obs.SetLeading(false)
		// Hand the lock on promptly so a rolling deploy's new pod doesn't wait
		// out a poll interval for a lock the old one has already stopped using.
		election.Release(shutdownCtx)
		// Give an in-flight pass a moment to notice the cancelled context;
		// anything it doesn't finish is re-read from the cursor, which is the
		// same path a crash takes.
		time.Sleep(500 * time.Millisecond)
		return nil
	})
	if err != nil {
		logger.Error("indexer exited", slog.Any("error", err))
		os.Exit(1)
	}
}
