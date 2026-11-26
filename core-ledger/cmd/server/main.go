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
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/serviceauth"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/workflowclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/oidcverify"

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

	// The API no longer runs sagas — cmd/worker does — and no longer runs
	// reconciliation either: that moved to cmd/reconcile, scheduled as a
	// CronJob with concurrencyPolicy: Forbid, because the in-process ticker
	// ran once per replica and scaling the API tripled the reconciliation
	// load for no extra assurance. What the API still needs both clients for
	// is CustodyAddress on wallet creation.
	clients, err := chainclients.Dial(logger, chainclients.Params{
		EthRPCURL:                cfg.EthRPCURL,
		USDXProxyAddress:         cfg.USDXProxyAddress,
		EthRelayerPrivKey:        cfg.EthRelayerPrivKey,
		SolanaRPCURL:             cfg.SolanaRPCURL,
		USDXProgramID:            cfg.USDXProgramID,
		USDXMintAddress:          cfg.USDXMintAddress,
		SolanaRelayerKeypairPath: cfg.SolanaRelayerKeypairPath,
		SignerURL:                cfg.SignerURL,
		SignerCertPath:           cfg.SignerCertPath,
		SignerKeyPath:            cfg.SignerKeyPath,
		SignerCAPath:             cfg.SignerCAPath,
		SignerEthKeyID:           cfg.SignerEthKeyID,
		SignerSolKeyID:           cfg.SignerSolKeyID,
		FinalityLevel:            cfg.ChainFinality,
	})
	if err != nil {
		logger.Error("connecting to chains", slog.Any("error", err))
		os.Exit(1)
	}

	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", repo.Ping)

	metrics := platform.NewMetrics(serviceName)

	// The one authentication boundary for the whole API: every route below
	// (except the probes, /metrics and the HMAC-authenticated workflow
	// callback) requires a Keycloak service-account token whose client role
	// authorizes it. Failing to reach the issuer at boot is fatal, same as
	// any other required dependency — there is no degraded unauthenticated
	// mode.
	verifier, err := oidcverify.New(context.Background(), cfg.AuthIssuerURL, cfg.AuthAudience)
	if err != nil {
		logger.Error("oidc discovery failed", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("oidc discovery complete", slog.String("issuer", cfg.AuthIssuerURL))

	// H4: the server now makes outbound calls of its own — it proposes
	// break-glass approvals to services/workflow — and they carry
	// svc-core-ledger's client-credentials token (workflow.propose), the
	// same internal/serviceauth wiring the worker got in H3. Required, with
	// no fallback: a confirm that cannot reach maker-checker must fail, not
	// settle.
	workflowAuth, err := serviceauth.Client(cfg.ServiceClientID, cfg.ServiceClientSecret, cfg.KeycloakBaseURL, cfg.KeycloakRealm)
	if err != nil {
		logger.Error("service-to-service auth is not configured (H4)", slog.Any("error", err))
		os.Exit(1)
	}
	if cfg.WorkflowCallbackSecret == "" {
		// Not fatal: with no secret, every decision callback fails its HMAC
		// check and no break-glass settles — closed, but nobody is told.
		logger.Warn("WORKFLOW_CALLBACK_SECRET is not set; workflow's decision callbacks will all be refused")
	}
	workflow := workflowclient.New(cfg.WorkflowURL, cfg.CoreLedgerSelfURL, workflowAuth, logger)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler:          platform.ErrorHandler,
	})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: metrics})
	// Before the audit middleware, so a call that cannot authenticate is
	// rejected before anything that could record it runs.
	app.Use(api.AuthMiddleware(verifier))
	// After Chain, so the request id it captures is the one Chain assigned.
	// What it captures rides on the request context down to the repository,
	// where the audit event is written inside the action's own transaction.
	app.Use(audit.Middleware())

	health.Register(app)
	app.Get("/metrics", metrics.Handler())
	api.NewHandlers(repo, ledgerSvc, logger, clients, clients.Router, workflow, cfg.WorkflowCallbackSecret).Register(app)

	addr := fmt.Sprintf(":%d", cfg.Port)
	if err := platform.Run(app, addr, health, logger, platform.ShutdownConfig{}); err != nil {
		logger.Error("server exited", slog.Any("error", err))
		os.Exit(1)
	}
}
