package main

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/api"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/authztable"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/identityclient"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/auth-proxy/internal/oidcverify"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"

	"github.com/gofiber/fiber/v2"
	"github.com/redis/go-redis/v9"
)

const serviceName = "auth-proxy"

var (
	version = "dev"
	commit  = "none"
)

type config struct {
	Port     int    `env:"PORT" default:"8090"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	// Keycloak. KeycloakIssuerURL must be the full realm issuer
	// (http://host:8080/realms/damp), not just the Keycloak base URL —
	// that's what OIDC discovery is relative to. OIDCAudience must match
	// the `aud` mapper's configured audience for the client whose tokens
	// this proxy verifies (the frontend's public client, damp-portal, by
	// default) — see docs/building-plan.md's P1 note on why the aud
	// mapper is mandatory.
	KeycloakIssuerURL string `env:"KEYCLOAK_ISSUER_URL" required:"true"`
	OIDCAudience      string `env:"OIDC_AUDIENCE" default:"damp-portal"`

	// services/identity isn't built yet (separate follow-on work — see
	// internal/identityclient's package doc). Leaving this unset falls
	// back to SubjectPassthroughResolver so auth-proxy is usable standalone
	// today; set it once identity lands.
	IdentityServiceURL string        `env:"IDENTITY_SERVICE_URL"`
	IdentityCacheTTL   time.Duration `env:"IDENTITY_CACHE_TTL" default:"5m"`

	// RedisURL is optional even with IdentityServiceURL set — an unset
	// Redis just means every request re-resolves identity, not a boot
	// failure; this proxy owns no database of its own and Redis is purely
	// an accelerator.
	RedisURL string `env:"REDIS_URL"`
}

func main() {
	var cfg config
	if err := platform.LoadConfig(&cfg); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}

	logger := platform.NewLogger(serviceName, cfg.LogLevel)
	slog.SetDefault(logger)

	ctx := context.Background()
	verifier, err := oidcverify.New(ctx, cfg.KeycloakIssuerURL, cfg.OIDCAudience)
	if err != nil {
		logger.Error("oidc discovery failed", slog.Any("error", err))
		os.Exit(1)
	}
	logger.Info("oidc discovery complete", slog.String("issuer", cfg.KeycloakIssuerURL))

	var redisClient *redis.Client
	if cfg.RedisURL != "" {
		opts, err := redis.ParseURL(cfg.RedisURL)
		if err != nil {
			logger.Error("invalid REDIS_URL", slog.Any("error", err))
			os.Exit(1)
		}
		redisClient = redis.NewClient(opts)
	}

	var resolver identityclient.Resolver = identityclient.SubjectPassthroughResolver{}
	if cfg.IdentityServiceURL != "" {
		resolver = identityclient.NewIdentityHTTPResolver(cfg.IdentityServiceURL, redisClient, cfg.IdentityCacheTTL)
		logger.Info("resolving identity via services/identity", slog.String("url", cfg.IdentityServiceURL))
	} else {
		logger.Warn("IDENTITY_SERVICE_URL not set — falling back to the Keycloak subject as party id; set it once services/identity is deployed")
	}

	health := platform.NewHealth(serviceName, version, commit)
	if redisClient != nil {
		health.AddCheck("redis", func(ctx context.Context) error { return redisClient.Ping(ctx).Err() })
	}

	metrics := platform.NewMetrics(serviceName)

	app := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler:          platform.ErrorHandler,
	})
	platform.Chain(app, platform.ChainConfig{Service: serviceName, Logger: logger, Metrics: metrics})

	health.Register(app)
	app.Get("/metrics", metrics.Handler())
	api.New(verifier, resolver, authztable.Default).Register(app)

	addr := fmt.Sprintf(":%d", cfg.Port)
	var cleanup []func(context.Context) error
	if redisClient != nil {
		cleanup = append(cleanup, func(context.Context) error { return redisClient.Close() })
	}
	if err := platform.Run(app, addr, health, logger, platform.ShutdownConfig{}, cleanup...); err != nil {
		logger.Error("server exited", slog.Any("error", err))
		os.Exit(1)
	}
}
