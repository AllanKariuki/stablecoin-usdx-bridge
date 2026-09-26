package platform

import (
	"strings"
	"testing"
	"time"
)

type testConfig struct {
	Port        int           `env:"TEST_PORT" default:"8081"`
	DatabaseURL string        `env:"TEST_DATABASE_URL" required:"true"`
	APIKey      string        `env:"TEST_API_KEY" required:"true"`
	LogLevel    string        `env:"TEST_LOG_LEVEL" default:"info"`
	Timeout     time.Duration `env:"TEST_TIMEOUT" default:"5s"`
	Debug       bool          `env:"TEST_DEBUG" default:"false"`
	Origins     []string      `env:"TEST_ORIGINS"`
}

func TestLoadConfig_MissingRequiredVarsAllReportedTogether(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "")
	t.Setenv("TEST_API_KEY", "")

	var cfg testConfig
	err := LoadConfig(&cfg)
	if err == nil {
		t.Fatal("expected an error for missing required vars, got nil")
	}

	var cErr *ConfigError
	if !asConfigError(err, &cErr) {
		t.Fatalf("expected *ConfigError, got %T: %v", err, err)
	}
	if len(cErr.Problems) != 2 {
		t.Fatalf("expected both missing vars reported in one error, got %d: %v", len(cErr.Problems), cErr.Problems)
	}
	if !strings.Contains(err.Error(), "TEST_DATABASE_URL") || !strings.Contains(err.Error(), "TEST_API_KEY") {
		t.Fatalf("expected both var names in error message, got: %v", err)
	}
}

func TestLoadConfig_DefaultsAndParsing(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "postgres://localhost/db")
	t.Setenv("TEST_API_KEY", "secret")
	t.Setenv("TEST_ORIGINS", "http://a.com, http://b.com")

	var cfg testConfig
	if err := LoadConfig(&cfg); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if cfg.Port != 8081 {
		t.Errorf("expected default Port 8081, got %d", cfg.Port)
	}
	if cfg.LogLevel != "info" {
		t.Errorf("expected default LogLevel info, got %q", cfg.LogLevel)
	}
	if cfg.Timeout != 5*time.Second {
		t.Errorf("expected default Timeout 5s, got %v", cfg.Timeout)
	}
	if cfg.Debug != false {
		t.Errorf("expected default Debug false, got %v", cfg.Debug)
	}
	if len(cfg.Origins) != 2 || cfg.Origins[0] != "http://a.com" || cfg.Origins[1] != "http://b.com" {
		t.Errorf("expected trimmed comma-split Origins, got %v", cfg.Origins)
	}
}

func TestLoadConfig_InvalidValueReported(t *testing.T) {
	t.Setenv("TEST_DATABASE_URL", "postgres://localhost/db")
	t.Setenv("TEST_API_KEY", "secret")
	t.Setenv("TEST_PORT", "not-a-number")

	var cfg testConfig
	err := LoadConfig(&cfg)
	if err == nil {
		t.Fatal("expected an error for an invalid port, got nil")
	}
	if !strings.Contains(err.Error(), "TEST_PORT") {
		t.Fatalf("expected TEST_PORT named in error, got: %v", err)
	}
}

func asConfigError(err error, target **ConfigError) bool {
	if ce, ok := err.(*ConfigError); ok {
		*target = ce
		return true
	}
	return false
}
