package platform

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
)

// ShutdownConfig tunes the drain/shutdown sequence. Zero values fall back to
// the platform defaults (5s drain, 15s shutdown) rather than blocking
// forever or cutting connections instantly.
type ShutdownConfig struct {
	DrainPeriod     time.Duration
	ShutdownTimeout time.Duration
}

const (
	defaultDrainPeriod     = 5 * time.Second
	defaultShutdownTimeout = 15 * time.Second
)

// Run starts app.Listen on addr and blocks until it exits or a SIGTERM/
// SIGINT arrives, then runs the standard drain sequence:
//  1. flip readiness false (health.SetReady(false)) — /readyz starts
//     returning 503 so the load balancer stops sending new traffic here
//  2. wait DrainPeriod so requests already in flight through the LB land
//     before...
//  3. app.ShutdownWithContext, bounded by ShutdownTimeout, to stop taking
//     new connections and let in-process requests finish
//  4. run cleanup (DB pool close, background job cancellation, etc.) in the
//     order given
//
// Returns the server's Listen error, if any (nil on a clean shutdown).
func Run(app *fiber.App, addr string, health *Health, logger *slog.Logger, cfg ShutdownConfig, cleanup ...func(context.Context) error) error {
	if cfg.DrainPeriod <= 0 {
		cfg.DrainPeriod = defaultDrainPeriod
	}
	if cfg.ShutdownTimeout <= 0 {
		cfg.ShutdownTimeout = defaultShutdownTimeout
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErrCh := make(chan error, 1)
	go func() {
		logger.Info("listening", slog.String("addr", addr))
		serveErrCh <- app.Listen(addr)
	}()

	select {
	case err := <-serveErrCh:
		return err
	case <-ctx.Done():
		stop()
		logger.Info("shutdown signal received", slog.Duration("drain_period", cfg.DrainPeriod))

		health.SetReady(false)
		time.Sleep(cfg.DrainPeriod)

		shutdownCtx, cancel := context.WithTimeout(context.Background(), cfg.ShutdownTimeout)
		defer cancel()
		if err := app.ShutdownWithContext(shutdownCtx); err != nil {
			logger.Error("error shutting down http server", slog.Any("error", err))
		}

		for _, fn := range cleanup {
			if err := fn(shutdownCtx); err != nil {
				logger.Error("error during cleanup", slog.Any("error", err))
			}
		}

		logger.Info("shutdown complete")
		return nil
	}
}
