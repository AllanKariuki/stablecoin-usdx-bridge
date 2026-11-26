// Package config is services/signer's environment surface.
package config

import (
	"fmt"
	"time"

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

	// MaxResigns caps how many times one (chain, method, correlation_id) may
	// be re-signed as rebuilt bytes after its first signature. Past it the
	// signer answers 409 RESIGN_LIMIT_REACHED and core-ledger parks the saga
	// for an operator. Keep in step with audit.DefaultMaxResigns, which says
	// why five; 0 disables re-signing entirely.
	MaxResigns int `env:"MAX_RESIGNS_PER_CORRELATION" default:"5"`

	// ResignAllowanceTTL is how long a runtime re-sign allowance (H7) stays
	// in effect. Temporary on purpose: an allowance exists to get ONE stuck
	// movement past a bad run of RPC trouble, and one that never expires is
	// a cap raise with extra steps — the operator should raise
	// MAX_RESIGNS_PER_CORRELATION instead and review it as a policy change.
	ResignAllowanceTTL time.Duration `env:"RESIGN_ALLOWANCE_TTL" default:"24h"`

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

// ResignCap validates MaxResigns. Negative is refused at boot rather than
// read as "unlimited" or clamped to zero: either reading silently changes
// how much relayer gas a bad retry storm can burn.
func (c Config) ResignCap() (int, error) {
	if c.MaxResigns < 0 {
		return 0, fmt.Errorf("MAX_RESIGNS_PER_CORRELATION must be 0 or more, got %d", c.MaxResigns)
	}
	return c.MaxResigns, nil
}

// ResignAllowanceTTLSeconds validates ResignAllowanceTTL. Zero or negative
// would make every grant expire as it is issued, which turns a runtime
// raise into a silent no-op — refused at boot instead.
func (c Config) ResignAllowanceTTLSeconds() (int64, error) {
	seconds := int64(c.ResignAllowanceTTL.Seconds())
	if seconds <= 0 {
		return 0, fmt.Errorf("RESIGN_ALLOWANCE_TTL must be positive, got %s", c.ResignAllowanceTTL)
	}
	return seconds, nil
}

// MTLSConfigured reports whether a certificate triple is present.
func (c Config) MTLSConfigured() bool {
	return c.TLSCertPath != "" && c.TLSKeyPath != "" && c.TLSClientCA != ""
}
