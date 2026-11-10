package config

import (
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
)

type Config struct {
	Port     int    `env:"PORT" default:"8085"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	DatabaseURL string `env:"DATABASE_URL" required:"true"`

	// How often a window of events is closed into a Merkle root. Hourly by
	// the plan; the trade is visible either way — shorter means an event
	// becomes externally provable sooner and costs more transactions.
	AnchorInterval time.Duration `env:"ANCHOR_INTERVAL" default:"1h"`

	// Publishing an anchor over two events costs the same as one over ten
	// thousand, so a quiet platform should not spend its budget on nothing.
	AnchorMinEvents int `env:"ANCHOR_MIN_EVENTS" default:"1"`

	// Bounds one window, so a backlog after an outage is anchored in several
	// trees rather than one enormous one.
	AnchorMaxEvents int `env:"ANCHOR_MAX_EVENTS" default:"50000"`

	// Where roots go: "log" (the default, and deliberately weak — see
	// internal/anchor/log_publisher.go) or "none".
	AnchorPublisher string `env:"ANCHOR_PUBLISHER" default:"log"`
}

func Load() (Config, error) {
	var cfg Config
	if err := platform.LoadConfig(&cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}
