package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/config"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/reconciliation"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

// version/commit are overridable at build time via
// -ldflags "-X main.version=... -X main.commit=...". Left as "dev"/"none"
// for a plain `go run`/`go build`.
var (
	version = "dev"
	commit  = "none"
)

const serviceName = "core-ledger"

func main() {
	cfg, err := config.Load()
	if err != nil {
		// No logger yet — config is what the logger's own level comes from —
		// so this is the one place core-ledger still writes straight to
		// stderr rather than through slog.
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

	// Seeding the currencies and the chart of accounts is idempotent, so it
	// runs on every boot rather than in a one-off script that a new
	// environment can forget.
	if err := repo.Bootstrap(context.Background(), ledger.DefaultCurrencies()); err != nil {
		logger.Error("seeding the chart of accounts", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("chart of accounts ready")

	ledgerSvc := ledger.NewService(repo, cfg.Fees())

	// The API no longer runs sagas — cmd/worker does — but reconciliation
	// still needs both chain clients to read supply.
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

	// RunForever has no way to be stopped — it takes no context and its
	// ticker is never cancelled. It also runs once per replica rather than
	// once total. Both are known, tracked for the P3 extraction into a
	// leader-elected CronJob (see the reconciliation section of the plan);
	// not fixed here so this doesn't pretend to support cancellation it
	// doesn't have.
	go reconciliation.NewJob(repo, clients.Ethereum, clients.Solana).RunForever()

	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", repo.Ping)

	metrics := platform.NewMetrics(serviceName)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler:          platform.ErrorHandler,
	})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: metrics})

	health.Register(app)
	app.Get("/metrics", metrics.Handler())
	api.NewHandlers(repo, ledgerSvc, logger, clients).Register(app)

	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := platform.Run(app, addr, health, logger, platform.ShutdownConfig{}); err != nil {
		logger.Error("server exited", slog.Any("error", err))
		os.Exit(1)
	}
}
