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

type numericTestConfig struct {
	// 2^32 does not fit an int32, so a default that comes through this field
	// proves the unsigned branch parsed at full width.
	WithDefault uint64 `env:"TEST_UINT64_DEFAULT" default:"4294967296"`
	Uint64      uint64 `env:"TEST_UINT64"`
	Int32       int32  `env:"TEST_INT32"`
}

func TestLoadConfig_NumericTypes(t *testing.T) {
	cases := []struct {
		name       string
		uint64Val  string
		int32Val   string
		wantErrIn  string
		wantUint64 uint64
	}{
		{
			name:       "uint64 parses",
			uint64Val:  "18446744073709551615",
			wantUint64: 18446744073709551615,
		},
		{
			// 4294967296 comes from WithDefault's tag; the shared check at the
			// end of the success path asserts it.
			name:      "default tag applies to uint64",
			uint64Val: "",
		},
		{
			name:      "negative uint64 is a config error",
			uint64Val: "-1",
			wantErrIn: "TEST_UINT64",
		},
		{
			name:      "int32 overflow is a config error",
			int32Val:  "3000000000",
			wantErrIn: "TEST_INT32",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			t.Setenv("TEST_UINT64", tc.uint64Val)
			t.Setenv("TEST_INT32", tc.int32Val)

			var cfg numericTestConfig
			err := LoadConfig(&cfg)

			if tc.wantErrIn != "" {
				if err == nil {
					t.Fatalf("expected an error for %s, got nil", tc.wantErrIn)
				}
				var cErr *ConfigError
				if !asConfigError(err, &cErr) {
					t.Fatalf("expected *ConfigError, got %T: %v", err, err)
				}
				if !strings.Contains(err.Error(), tc.wantErrIn) {
					t.Fatalf("expected %s named in error, got: %v", tc.wantErrIn, err)
				}
				return
			}

			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if cfg.Uint64 != tc.wantUint64 {
				t.Errorf("expected Uint64 %d, got %d", tc.wantUint64, cfg.Uint64)
			}
			if cfg.WithDefault != 4294967296 {
				t.Errorf("expected default WithDefault 4294967296, got %d", cfg.WithDefault)
			}
		})
	}
}
