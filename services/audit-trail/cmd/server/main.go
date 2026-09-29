// Command audit-trail records who did what, in a form that survives somebody
// with database access deciding they would rather it said something else.
//
// Two mechanisms, answering different questions. The hash chain answers "has
// anything been removed or altered", to anyone who can read the table. The
// Merkle anchors answer "and when was this written", by putting a root
// somewhere this platform does not control — which is the half the chain
// cannot do, because an attacker who controls the database can rewrite it
// from any point and produce a log that verifies perfectly.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/anchor"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/config"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/audit-trail/internal/store"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
)

var (
	version = "dev"
	commit  = "none"
)

const serviceName = "audit-trail"

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
		logger.Error("opening the audit database", slog.Any("error", err))
		os.Exit(1)
	}
	defer st.Close()

	// Verified at boot, and a break is a refusal to start — the same
	// discipline services/signer applies to its own log, for the same reason:
	// a break discovered later cannot be dated, because every row after it is
	// equally suspect.
	if intact, brokenAt, checked, verr := st.Verify(context.Background()); verr != nil {
		logger.Warn("could not verify the audit chain at boot", slog.Any("error", verr))
	} else if !intact {
		logger.Error("THE AUDIT CHAIN IS BROKEN — refusing to start",
			slog.String("first_broken_event", brokenAt), slog.Int("events_checked", checked))
		os.Exit(1)
	} else {
		logger.Info("audit chain verified", slog.Int("events", checked))
	}

	var publisher anchor.Publisher
	switch cfg.AnchorPublisher {
	case "log":
		publisher = anchor.NewLogPublisher(logger)
	case "none", "":
		// Roots are still computed and stored, marked SKIPPED, so publishing
		// later remains possible. An unpublished anchor is a weaker
		// guarantee, not a lost one.
		logger.Warn("no anchor publisher configured; roots are computed and stored but not witnessed externally")
	default:
		logger.Error("unknown anchor publisher", slog.String("publisher", cfg.AnchorPublisher))
		os.Exit(1)
	}

	anchorSvc := anchor.New(st, publisher, logger)
	anchorSvc.Interval = cfg.AnchorInterval
	anchorSvc.MinEvents = cfg.AnchorMinEvents
	anchorSvc.MaxEvents = cfg.AnchorMaxEvents

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go anchorSvc.Run(ctx)

	health := platform.NewHealth(serviceName, version, commit)
	health.AddCheck("database", st.Ping)

	metrics := platform.NewMetrics(serviceName)

	app := fiber.New(fiber.Config{DisableStartupMessage: true, ErrorHandler: platform.ErrorHandler})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: metrics})
	health.Register(app)
	app.Get("/metrics", metrics.Handler())
	api.New(st, logger).Register(app)

	addr := fmt.Sprintf(":%d", cfg.Port)
	err = platform.Run(app, addr, health, logger, platform.ShutdownConfig{}, func(context.Context) error {
		cancel()
		return nil
	})
	if err != nil {
		logger.Error("audit-trail exited", slog.Any("error", err))
		os.Exit(1)
	}
}
