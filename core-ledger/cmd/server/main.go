package main

import (
	"context"
	"errors"
	"log"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/solana"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/reconciliation"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/logger"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
)

// version/commit are overridable at build time via
// -ldflags "-X main.version=... -X main.commit=...". Left as "dev"/"none"
// for a plain `go run`/`go build`.
var (
	version = "dev"
	commit  = "none"
)

func main() {
	repo, err := ledger.NewRepository(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("connecting to postgres: %v", err)
	}

	log.Println("connected to postgres database")

	// Seeding the currencies and the chart of accounts is idempotent, so it
	// runs on every boot rather than in a one-off script that a new
	// environment can forget.
	if err := repo.Bootstrap(context.Background(), ledger.DefaultCurrencies()); err != nil {
		log.Fatalf("seeding the chart of accounts: %v", err)
	}

	log.Println("chart of accounts ready")

	ledgerSvc := ledger.NewService(repo, ledger.FeeSchedule{
		IssuanceBps:   bpsFromEnv("FEE_ISSUANCE_BPS", 0),
		RedemptionBps: bpsFromEnv("FEE_REDEMPTION_BPS", 0),
		TransferBps:   bpsFromEnv("FEE_TRANSFER_BPS", 0),
		WithdrawalBps: bpsFromEnv("FEE_WITHDRAWAL_BPS", 0),
	})

	// Both chains are still required at boot (a full lazy-connect + circuit
	// breaker belongs with the saga durability rework in P2 — see
	// docs/plan and internal/bridge/saga.go). What changes here: a single
	// transient RPC blip no longer takes the whole ledger down immediately —
	// dialing retries with backoff before giving up.
	var ethClient *ethereum.Client
	if err := retryWithBackoff("ethereum", func() (err error) {
		ethClient, err = ethereum.NewClient(
			os.Getenv("ETH_RPC_URL"),
			os.Getenv("USDX_PROXY_ADDRESS"),
			os.Getenv("ETH_RELAYER_PRIVATE_KEY"),
		)
		return err
	}); err != nil {
		log.Fatalf("connecting to ethereum: %v", err)
	}

	log.Println("connected to ethereum network")

	var solClient *solana.Client
	if err := retryWithBackoff("solana", func() (err error) {
		solClient, err = solana.NewClient(
			os.Getenv("SOLANA_RPC_URL"),
			os.Getenv("USDX_PROGRAM_ID"),
			os.Getenv("USDX_MINT_ADDRESS"),
			os.Getenv("SOLANA_RELAYER_KEYPAIR_PATH"),
		)
		return err
	}); err != nil {
		log.Fatalf("connecting to solana: %v", err)
	}

	log.Println("connected to solana network")

	router := bridge.NewRouter(ethClient, solClient)
	saga := bridge.NewSaga(repo, ledgerSvc, router)

	// RunForever has no way to be stopped — it takes no context and its
	// ticker is never cancelled. It also runs once per replica rather than
	// once total. Both are known, tracked for the P3 extraction into a
	// leader-elected CronJob (see the reconciliation section of the plan);
	// not fixed here so this doesn't pretend to support cancellation it
	// doesn't have.
	go reconciliation.NewJob(repo, ethClient, solClient).RunForever()

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
	})

	// Order matters: recover first so a panic anywhere below is still caught
	// and logged rather than killing the process mid-request; requestid
	// next so the logger and every handler downstream can tag their output
	// with it.
	app.Use(recover.New())
	app.Use(requestid.New())
	app.Use(logger.New(logger.Config{
		Format: "${time} ${status} ${latency} ${method} ${path} reqid=${locals:requestid}\n",
	}))

	registerOpsRoutes(app, repo, version, commit)
	api.NewHandlers(repo, ledgerSvc, saga).Register(app)

	addr := ":" + portFromEnv("PORT", "8081")

	// Graceful shutdown: on SIGTERM/SIGINT, stop taking new work, drain
	// in-flight requests within a bound, then let main return. The
	// reconciliation goroutine gets the same cancellation.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	serveErrCh := make(chan error, 1)
	go func() {
		log.Printf("core-ledger listening on %s", addr)
		serveErrCh <- app.Listen(addr)
	}()

	select {
	case err := <-serveErrCh:
		if err != nil {
			log.Fatalf("server exited: %v", err)
		}
	case <-ctx.Done():
		stop()
		log.Println("shutdown signal received, draining in-flight requests")
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()
		if err := app.ShutdownWithContext(shutdownCtx); err != nil {
			log.Printf("error during shutdown: %v", err)
		}
		log.Println("shutdown complete")
	}
}

// registerOpsRoutes wires the endpoints every service in the platform is
// expected to expose identically (see the P0 cross-cutting conventions):
// liveness never touches a dependency, readiness checks the ones this
// process actually needs.
func registerOpsRoutes(app *fiber.App, repo *ledger.Repository, version, commit string) {
	app.Get("/healthz", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{"status": "ok"})
	})

	app.Get("/readyz", func(c *fiber.Ctx) error {
		checks := fiber.Map{}
		ready := true

		if err := repo.Ping(c.Context()); err != nil {
			ready = false
			checks["database"] = fiber.Map{"ok": false, "error": err.Error()}
		} else {
			checks["database"] = fiber.Map{"ok": true}
		}

		status := fiber.StatusOK
		state := "ok"
		if !ready {
			status = fiber.StatusServiceUnavailable
			state = "degraded"
		}
		return c.Status(status).JSON(fiber.Map{"status": state, "checks": checks})
	})

	app.Get("/version", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "core-ledger",
			"version": version,
			"commit":  commit,
		})
	})
}

// retryWithBackoff bounds how long boot waits on a flaky chain RPC endpoint
// before giving up — a single transient blip (a public RPC provider having
// a bad few seconds) no longer takes an equally-transient outage and turns
// it into a hard boot failure. Still fails the process after the budget is
// exhausted; full lazy/degraded chain connectivity is P2 scope.
func retryWithBackoff(label string, connect func() error) error {
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
		log.Printf("connecting to %s (attempt %d/%d) failed: %v — retrying in %s",
			label, attempt, maxAttempts, lastErr, backoff)
		time.Sleep(backoff)
		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
	return errors.Join(lastErr, errFmt(label, maxAttempts))
}

func errFmt(label string, attempts int) error {
	return &retryExhaustedError{label: label, attempts: attempts}
}

type retryExhaustedError struct {
	label    string
	attempts int
}

func (e *retryExhaustedError) Error() string {
	return e.label + ": gave up after " + strconv.Itoa(e.attempts) + " attempts"
}

// portFromEnv reads the port to bind, defaulting to 8081 rather than the
// platform-wide 8080, which Keycloak owns (see infra/keycloak). Fails fast
// on a non-numeric value instead of letting Listen() produce a confusing
// bind error later.
func portFromEnv(key, fallback string) string {
	raw := os.Getenv(key)
	if raw == "" {
		raw = fallback
	}
	if _, err := strconv.Atoi(raw); err != nil {
		log.Fatalf("%s must be a valid port number, got %q", key, raw)
	}
	return raw
}

// bpsFromEnv reads a fee in basis points, defaulting to zero so a missing
// config variable can never invent a charge the customer didn't agree to.
func bpsFromEnv(key string, fallback int32) int32 {
	raw := os.Getenv(key)
	if raw == "" {
		return fallback
	}
	v, err := strconv.ParseInt(raw, 10, 32)
	if err != nil || v < 0 || v > 10000 {
		log.Fatalf("%s must be a whole number of basis points between 0 and 10000, got %q", key, raw)
	}
	return int32(v)
}
