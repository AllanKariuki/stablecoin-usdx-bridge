// Command signer is the only process on this platform that can authorise a
// chain transaction.
//
// P6's goal, from docs/building-plan.md: *"no private key material in any
// process env or on any disk."* This is where that becomes true — core-ledger
// stops holding ETH_RELAYER_PRIVATE_KEY and starts asking a service that
// holds it in Vault or Fireblocks, over mutually-authenticated TLS, and that
// refuses anything outside its policy.
//
// The value is not in moving the key. It is in what the service refuses: a
// key in Vault that signs whatever it is handed has moved the risk, not
// removed it.
package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"log/slog"
	"os"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/audit"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/config"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/keystore"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/policy"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

var (
	version = "dev"
	commit  = "none"
)

const serviceName = "signer"

func main() {
	cfg, err := config.Load()
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	logger := platform.NewLogger(serviceName, cfg.LogLevel)
	slog.SetDefault(logger)

	// The policy is loaded before anything else that could sign. A signer
	// that started with an unreadable policy and refused everything would
	// look like a total outage, and the fix somebody reaches for under that
	// pressure is to disable the check — so it fails at boot instead, loudly,
	// with the path in the message.
	signingPolicy, err := policy.Load(cfg.PolicyPath)
	if err != nil {
		logger.Error("loading the signing policy", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("signing policy loaded",
		slog.Int("rules", len(signingPolicy.Rules)),
		slog.Int("daily_limits", len(signingPolicy.DailyLimits)))

	backend, err := keystore.Resolve(cfg.KeyBackend, cfg.Env, keystore.Config{
		EthPrivateKeyHex:     cfg.EthPrivateKeyHex,
		SolKeypairPath:       cfg.SolKeypairPath,
		VaultAddr:            cfg.VaultAddr,
		VaultToken:           cfg.VaultToken,
		VaultTransitKey:      cfg.VaultTransitKey,
		VaultKVPath:          cfg.VaultKVPath,
		FireblocksAPIKey:     cfg.FireblocksAPIKey,
		FireblocksSecretPath: cfg.FireblocksSecretPath,
		FireblocksVaultID:    cfg.FireblocksVaultID,
	})
	if err != nil {
		logger.Error("resolving the key backend", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("key backend ready", slog.String("backend", backend.Name()))

	auditLog, err := audit.Open(cfg.DatabaseURL)
	if err != nil {
		logger.Error("opening the audit log", slog.Any("error", err))
		os.Exit(1)
	}
	defer auditLog.Close()

	// The chain is verified at boot. If the log has been tampered with, that
	// is something to know before signing anything else into it — a break
	// discovered later cannot be dated, because every row after the break is
	// equally suspect.
	if intact, brokenAt, checked, verr := auditLog.Verify(context.Background()); verr != nil {
		logger.Warn("could not verify the audit chain at boot", slog.Any("error", verr))
	} else if !intact {
		logger.Error("THE AUDIT CHAIN IS BROKEN — refusing to start",
			slog.String("first_broken_record", brokenAt),
			slog.Int("records_checked", checked))
		os.Exit(1)
	} else {
		logger.Info("audit chain verified", slog.Int("records", checked))
	}

	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", auditLog.Ping)

	metrics := platform.NewMetrics(serviceName)

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: metrics})
	// Before the routes: every handler reads the client identity this sets.
	app.Use(api.ClientIdentity())
	health.Register(app)
	app.Get("/metrics", metrics.Handler())
	api.New(backend, signingPolicy, auditLog, logger).Register(app)

	addr := fmt.Sprintf(":%d", cfg.Port)

	if !cfg.MTLSConfigured() {
		if cfg.Env != "local" {
			// A signer reachable without a client certificate is a signer
			// anybody on the network can mint with. Outside local
			// development that is not a warning, it is a refusal.
			logger.Error("mTLS is not configured and ENV is not local; refusing to start",
				slog.String("env", cfg.Env))
			os.Exit(1)
		}
		logger.Warn("starting WITHOUT mTLS: every caller is unauthenticated. Local development only.")
		if err := platform.Run(app, addr, health, logger, platform.ShutdownConfig{}); err != nil {
			logger.Error("signer exited", slog.Any("error", err))
			os.Exit(1)
		}
		return
	}

	tlsConfig, err := api.ServerTLSConfig(cfg.TLSCertPath, cfg.TLSKeyPath, cfg.TLSClientCA)
	if err != nil {
		logger.Error("building the mTLS configuration", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("listening with mutual TLS", slog.String("addr", addr))

	// RunWith rather than Run: the drain sequence is identical, only the
	// listen call differs. Putting a TLS branch inside Run would place a
	// security-critical configuration in a helper every service imports, for
	// one caller's benefit.
	// Listener built here rather than through Fiber's TLS helpers, because
	// only tls.Config expresses RequireAndVerifyClientCert — Fiber's
	// convenience wrappers take a cert pool and pick the client-auth mode
	// themselves, and the weaker mode (VerifyClientCertIfGiven) accepts a
	// connection with no certificate at all.
	listener, err := tls.Listen("tcp", addr, tlsConfig)
	if err != nil {
		logger.Error("binding the mTLS listener", slog.Any("error", err))
		os.Exit(1)
	}
	listen := func() error { return app.Listener(listener) }
	if err := platform.RunWith(app, addr, listen, health, logger, platform.ShutdownConfig{}); err != nil {
		logger.Error("signer exited", slog.Any("error", err))
		os.Exit(1)
	}
}
