// Command worker drains the bridge saga queue and the transactional outbox.
//
// It exists because `go saga.Execute(...)` did not survive a restart. Running
// it as its own process rather than a goroutine inside the API is what lets it
// be scaled, restarted and killed independently of the endpoint that accepts
// money — and what makes "kill -9 the worker mid-flight and the transfer still
// completes" a thing you can actually do.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/config"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/outbox"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/worker"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

var (
	version = "dev"
	commit  = "none"
)

const serviceName = "core-ledger-worker"

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	logger := platform.NewLogger(serviceName, cfg.LogLevel)
	slog.SetDefault(logger)

	repo, err := ledger.NewRepository(cfg.DatabaseURL)
	if err != nil {
		logger.Error("connecting to postgres", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("connected to postgres database")

	clients, err := chainclients.Dial(logger, chainclients.Params{
		EthRPCURL:                cfg.EthRPCURL,
		USDXProxyAddress:         cfg.USDXProxyAddress,
		EthRelayerPrivKey:        cfg.EthRelayerPrivKey,
		SolanaRPCURL:             cfg.SolanaRPCURL,
		USDXProgramID:            cfg.USDXProgramID,
		USDXMintAddress:          cfg.USDXMintAddress,
		SolanaRelayerKeypairPath: cfg.SolanaRelayerKeypairPath,
	})
	if err != nil {
		logger.Error("connecting to chains", slog.Any("error", err))
		os.Exit(1)
	}

	// Solana USD-X is platform-custodied (docs/building-plan.md, Open decision
	// 1): the platform owns the token account and delegates burn authority
	// over it to the mint-authority PDA. Without that delegation, every
	// SOL->ETH bridge and every Solana redemption fails the program's
	// NoDelegateApproval constraint — which is precisely the asymmetry that
	// made SOL->ETH impossible before P2.
	//
	// Both instructions are idempotent, so this runs at boot rather than as a
	// migration someone has to remember; re-running also refreshes the
	// allowance. A failure here is logged rather than fatal: the Ethereum side
	// of the queue is unaffected, and a Solana burn that fails for want of the
	// delegation dead-letters visibly instead of disappearing.
	if sig, err := clients.Solana.EnsureCustody(context.Background()); err != nil {
		logger.Warn("could not establish Solana custody delegation; Solana burns will fail until this succeeds",
			slog.Any("error", err))
	} else {
		logger.Info("Solana custody delegation granted",
			slog.String("custody_address", clients.Solana.CustodyAddress()),
			slog.String("signature", sig))
	}

	ledgerSvc := ledger.NewService(repo, cfg.Fees())
	saga := bridge.NewSaga(repo, ledgerSvc, clients.Router, logger)
	saga.Finality = cfg.ChainFinality
	if cfg.IndexerURL != "" {
		// The indexer is already watching both chains, so the saga asks it
		// rather than parking a goroutine on an RPC poll — and gets an answer
		// that distinguishes "not seen yet" from "seen and then orphaned",
		// which a receipt poll cannot. The chain poll stays as the fallback
		// for anything the indexer can't answer.
		saga.UseIndexerFinality(cfg.IndexerURL)
		logger.Info("saga finality resolved through services/indexer",
			slog.String("indexer_url", cfg.IndexerURL))
	}

	workerCfg := worker.DefaultConfig()
	workerCfg.Concurrency = cfg.WorkerConcurrency
	w := worker.New(repo, saga, logger, workerCfg)

	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		w.Run(ctx)
	}()

	// The relay is optional and its absence is not a degraded state: the
	// outbox keeping every event durably is exactly what it is for. P3 turns
	// the Publisher seam built in P2 from an HTTP POST into a JetStream
	// publish without touching a line of domain code — see outbox.Choose.
	outboxMetrics := outbox.NewMetrics()
	publisher, closePublisher := outbox.Choose(ctx, logger, cfg.NATSURL, cfg.NATSStream, cfg.OutboxRelayURL)
	defer closePublisher()
	if publisher != nil {
		relay := outbox.NewRelay(repo.OutboxStore(), publisher, logger).WithMetrics(outboxMetrics)
		go relay.Run(ctx)
	}

	// The worker serves no business traffic, but it still needs probes: a
	// replica whose database connection has gone should stop being counted as
	// a live consumer of the queue.
	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", repo.Ping)

	metrics := platform.NewMetrics(serviceName)
	if err := metrics.Register(outboxMetrics.Collectors()...); err != nil {
		logger.Error("registering outbox metrics", slog.Any("error", err))
		os.Exit(1)
	}
	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: metrics})
	health.Register(app)
	app.Get("/metrics", metrics.Handler())

	addr := fmt.Sprintf(":%d", cfg.WorkerPort)
	err = platform.Run(app, addr, health, logger, platform.ShutdownConfig{}, func(context.Context) error {
		// Stop claiming, then let attempts already running finish. Whatever
		// doesn't finish keeps its lease until it lapses and is picked up by
		// another replica — which is the same path a crash takes, exercised
		// on every ordinary deploy.
		cancel()
		select {
		case <-stopped:
		case <-time.After(workerCfg.ShutdownGrace):
			logger.Warn("saga worker did not drain within the grace period; leases will lapse")
		}
		return nil
	})
	if err != nil {
		logger.Error("worker exited", slog.Any("error", err))
		os.Exit(1)
	}
}
