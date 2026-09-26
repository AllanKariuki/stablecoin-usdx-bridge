package main

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/solana"
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

// config is core-ledger's full environment surface. Centralizing it here —
// rather than each dependency reading its own os.Getenv deep in its own
// constructor — is what lets platform.LoadConfig report every missing var
// in one shot instead of a Fatalf-per-typo loop across five redeploys.
type config struct {
	Port     int    `env:"PORT" default:"8081"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	DatabaseURL string `env:"DATABASE_URL" required:"true"`

	EthRPCURL         string `env:"ETH_RPC_URL" required:"true"`
	USDXProxyAddress  string `env:"USDX_PROXY_ADDRESS" required:"true"`
	EthRelayerPrivKey string `env:"ETH_RELAYER_PRIVATE_KEY" required:"true"`

	SolanaRPCURL             string `env:"SOLANA_RPC_URL" default:"http://localhost:8899"`
	USDXProgramID            string `env:"USDX_PROGRAM_ID" required:"true"`
	USDXMintAddress          string `env:"USDX_MINT_ADDRESS" required:"true"`
	SolanaRelayerKeypairPath string `env:"SOLANA_RELAYER_KEYPAIR_PATH" required:"true"`

	FeeIssuanceBps   int32 `env:"FEE_ISSUANCE_BPS" default:"0"`
	FeeRedemptionBps int32 `env:"FEE_REDEMPTION_BPS" default:"0"`
	FeeTransferBps   int32 `env:"FEE_TRANSFER_BPS" default:"0"`
	FeeWithdrawalBps int32 `env:"FEE_WITHDRAWAL_BPS" default:"0"`
}

func main() {
	var cfg config
	if err := platform.LoadConfig(&cfg); err != nil {
		// No logger yet — config is what the logger's own level comes
		// from — so this is the one place core-ledger still writes
		// straight to stderr rather than through slog.
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
	if err := validateFees(cfg); err != nil {
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

	ledgerSvc := ledger.NewService(repo, ledger.FeeSchedule{
		IssuanceBps:   cfg.FeeIssuanceBps,
		RedemptionBps: cfg.FeeRedemptionBps,
		TransferBps:   cfg.FeeTransferBps,
		WithdrawalBps: cfg.FeeWithdrawalBps,
	})

	// Both chains are still required at boot (a full lazy-connect + circuit
	// breaker belongs with the saga durability rework in P2 — see
	// docs/building-plan.md and internal/bridge/saga.go). What changes
	// here: a single transient RPC blip no longer takes the whole ledger
	// down immediately — dialing retries with backoff before giving up.
	var ethClient *ethereum.Client
	if err := retryWithBackoff(logger, "ethereum", func() (err error) {
		ethClient, err = ethereum.NewClient(cfg.EthRPCURL, cfg.USDXProxyAddress, cfg.EthRelayerPrivKey)
		return err
	}); err != nil {
		logger.Error("connecting to ethereum", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("connected to ethereum network")

	var solClient *solana.Client
	if err := retryWithBackoff(logger, "solana", func() (err error) {
		solClient, err = solana.NewClient(cfg.SolanaRPCURL, cfg.USDXProgramID, cfg.USDXMintAddress, cfg.SolanaRelayerKeypairPath)
		return err
	}); err != nil {
		logger.Error("connecting to solana", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("connected to solana network")

	router := bridge.NewRouter(ethClient, solClient)
	saga := bridge.NewSaga(repo, ledgerSvc, router)

	// RunForever has no way to be stopped — it takes no context and its
	// ticker is never cancelled. It also runs once per replica rather than
	// once total. Both are known, tracked for the P3 extraction into a
	// leader-elected CronJob (see the reconciliation section of the plan);
	// not fixed here so this doesn't pretend to support cancellation it
	// doesn't have.
	go reconciliation.NewJob(repo, ethClient, solClient).RunForever()

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
	api.NewHandlers(repo, ledgerSvc, saga).Register(app)

	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := platform.Run(app, addr, health, logger, platform.ShutdownConfig{}); err != nil {
		logger.Error("server exited", slog.Any("error", err))
		os.Exit(1)
	}
}

// retryWithBackoff bounds how long boot waits on a flaky chain RPC endpoint
// before giving up — a single transient blip (a public RPC provider having
// a bad few seconds) no longer takes an equally-transient outage and turns
// it into a hard boot failure. Still fails the process after the budget is
// exhausted; full lazy/degraded chain connectivity is P2 scope.
func retryWithBackoff(logger *slog.Logger, label string, connect func() error) error {
	const maxAttempts = 5
	backoff := 2 * time.Second
	const maxBackoff = 30 * time.Second

	var lastErr error
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		if err := connect(); err == nil {
			return nil
		} else {
			lastErr = err
		}
		if attempt == maxAttempts {
			break
		}
		logger.Warn("chain connection attempt failed, retrying",
			slog.String("chain", label), slog.Int("attempt", attempt), slog.Int("max_attempts", maxAttempts),
			slog.Duration("backoff", backoff), slog.Any("error", lastErr))
		time.Sleep(backoff)
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
	return errors.Join(lastErr, fmt.Errorf("%s: gave up after %d attempts", label, maxAttempts))
}

// validateFees enforces the 0-10000bps range platform.LoadConfig's generic
// int parsing doesn't know about, reporting every out-of-range fee together
// rather than one Fatalf at a time.
func validateFees(cfg config) error {
	fees := map[string]int32{
		"FEE_ISSUANCE_BPS":   cfg.FeeIssuanceBps,
		"FEE_REDEMPTION_BPS": cfg.FeeRedemptionBps,
		"FEE_TRANSFER_BPS":   cfg.FeeTransferBps,
		"FEE_WITHDRAWAL_BPS": cfg.FeeWithdrawalBps,
	}
	var problems []string
	for name, v := range fees {
		if v < 0 || v > 10000 {
			problems = append(problems, fmt.Sprintf("%s: must be a whole number of basis points between 0 and 10000, got %d", name, v))
		}
	}
	if len(problems) > 0 {
		return &platform.ConfigError{Problems: problems}
	}
	return nil
}
