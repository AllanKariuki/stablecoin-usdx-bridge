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

	ledgerSvc := ledger.NewService(repo, cfg.Fees())
	saga := bridge.NewSaga(repo, ledgerSvc, clients.Router, logger)
	saga.Finality = cfg.ChainFinality

	workerCfg := worker.DefaultConfig()
	workerCfg.Concurrency = cfg.WorkerConcurrency
	w := worker.New(repo, saga, logger, workerCfg)

	ctx, cancel := context.WithCancel(context.Background())
	stopped := make(chan struct{})
	go func() {
		defer close(stopped)
		w.Run(ctx)
	}()

	// The relay is optional and its absence is not a degraded state: until
	// the indexer lands in P3 there is nothing to publish to, and the outbox
	// keeping every event durably is exactly what it is for.
	if cfg.OutboxRelayURL != "" {
		relay := outbox.NewRelay(repo.OutboxStore(), outbox.NewHTTPPublisher(cfg.OutboxRelayURL), logger)
		go relay.Run(ctx)
	} else {
		logger.Info("outbox relay disabled (OUTBOX_RELAY_URL is unset); events accumulate durably")
	}

	// The worker serves no business traffic, but it still needs probes: a
	// replica whose database connection has gone should stop being counted as
	// a live consumer of the queue.
	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", repo.Ping)

	metrics := platform.NewMetrics(serviceName)
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
