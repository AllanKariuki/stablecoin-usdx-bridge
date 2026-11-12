// Package config is services/signer's environment surface.
package config

import (
	"fmt"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/decode"
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

	// --- deployment: which contracts are ours ---
	//
	// The same names and values core-ledger is configured with. Required
	// outside local (see Deployment); a chain left unset signs nothing.
	USDXProxyAddress string `env:"USDX_PROXY_ADDRESS" default:""`
	USDXProgramID    string `env:"USDX_PROGRAM_ID" default:""`
	USDXMintAddress  string `env:"USDX_MINT_ADDRESS" default:""`

	// --- services/audit-trail ---
	//
	// Every Append also writes an audit_outbox row in the same transaction;
	// the relay delivers them here. Empty is supported — events wait durably
	// — and logged as a warning. The token is audit-trail's INGEST_TOKEN.
	AuditTrailURL   string `env:"AUDIT_TRAIL_URL" default:""`
	AuditTrailToken string `env:"AUDIT_TRAIL_TOKEN" default:""`
}

func Load() (Config, error) {
	var cfg Config
	if err := platform.LoadConfig(&cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// Deployment parses and validates the contract/program/mint the signer will
// sign for.
//
// Outside ENV=local all three are required. Unset there would not fail at
// boot — it would fail at the first mint on that chain, as a refusal inside a
// saga that somebody then has to trace back to configuration. In local
// development a chain may be left unset (it then signs nothing), but whatever
// is set must still parse.
func (c Config) Deployment() (decode.Deployment, error) {
	dep, err := decode.ParseDeployment(c.USDXProxyAddress, c.USDXProgramID, c.USDXMintAddress)
	if err != nil {
		return dep, err
	}
	if c.Env != "local" {
		if err := dep.RequireComplete(); err != nil {
			return dep, fmt.Errorf("%w (required when ENV is not local)", err)
		}
	}
	return dep, nil
}

// MTLSConfigured reports whether a certificate triple is present.
func (c Config) MTLSConfigured() bool {
	return c.TLSCertPath != "" && c.TLSKeyPath != "" && c.TLSClientCA != ""
}
