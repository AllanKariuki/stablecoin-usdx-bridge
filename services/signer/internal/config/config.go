// Package config is services/signer's environment surface.
package config

import (
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
)

type Config struct {
	Port     int    `env:"PORT" default:"8084"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	// Env gates the local key backend. A deployment that forgot to set a
	// backend must not quietly fall back to holding keys in memory — see
	// keystore.Resolve.
	Env string `env:"ENV" default:"local"`

	// The signer's own database: the append-only, hash-chained record of
	// every signature it has produced and every one it has refused.
	DatabaseURL string `env:"DATABASE_URL" required:"true"`

	KeyBackend string `env:"KEY_BACKEND" default:"local"`

	// --- local backend ---
	EthPrivateKeyHex string `env:"ETH_RELAYER_PRIVATE_KEY" default:""`
	SolKeypairPath   string `env:"SOLANA_RELAYER_KEYPAIR_PATH" default:""`

	// --- vault backend ---
	VaultAddr       string `env:"VAULT_ADDR" default:""`
	VaultToken      string `env:"VAULT_TOKEN" default:""`
	VaultTransitKey string `env:"VAULT_TRANSIT_KEY" default:"usdx-solana-relayer"`
	VaultKVPath     string `env:"VAULT_KV_PATH" default:"secret/data/usdx/eth-relayer"`

	// --- fireblocks backend (stub) ---
	FireblocksAPIKey     string `env:"FIREBLOCKS_API_KEY" default:""`
	FireblocksSecretPath string `env:"FIREBLOCKS_SECRET_PATH" default:""`
	FireblocksVaultID    string `env:"FIREBLOCKS_VAULT_ID" default:""`

	// --- mTLS ---
	//
	// Required in every environment except local. A signer reachable without
	// a client certificate is a signer anybody on the network can mint with.
	TLSCertPath string `env:"TLS_CERT_PATH" default:""`
	TLSKeyPath  string `env:"TLS_KEY_PATH" default:""`
	TLSClientCA string `env:"TLS_CLIENT_CA_PATH" default:""`

	// --- policy ---
	PolicyPath string `env:"POLICY_PATH" default:"/app/policy.yaml"`
}

func Load() (Config, error) {
	var cfg Config
	if err := platform.LoadConfig(&cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// MTLSConfigured reports whether a certificate triple is present.
func (c Config) MTLSConfigured() bool {
	return c.TLSCertPath != "" && c.TLSKeyPath != "" && c.TLSClientCA != ""
}
