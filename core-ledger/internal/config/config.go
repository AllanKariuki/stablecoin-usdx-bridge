// Package config is core-ledger's full environment surface, shared by both
// binaries.
//
// The API and the saga worker must agree exactly about the database, the
// chains and the fee schedule — they post to the same journal — so the
// definition lives in one place rather than being copied into two mains that
// then drift a default apart.
package config

import (
	"fmt"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
)

type Config struct {
	Port     int    `env:"PORT" default:"8081"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	DatabaseURL string `env:"DATABASE_URL" required:"true"`

	EthRPCURL        string `env:"ETH_RPC_URL" required:"true"`
	USDXProxyAddress string `env:"USDX_PROXY_ADDRESS" required:"true"`

	// EthRelayerPrivKey is no longer required: with SIGNER_URL set, this
	// process holds no key material at all, which is P6's entire goal.
	// Validation that exactly one of the two is configured happens in
	// validateSigning below, so a deployment cannot silently end up with
	// neither.
	EthRelayerPrivKey string `env:"ETH_RELAYER_PRIVATE_KEY" default:""`

	SolanaRPCURL             string `env:"SOLANA_RPC_URL" default:"http://localhost:8899"`
	USDXProgramID            string `env:"USDX_PROGRAM_ID" required:"true"`
	USDXMintAddress          string `env:"USDX_MINT_ADDRESS" required:"true"`
	SolanaRelayerKeypairPath string `env:"SOLANA_RELAYER_KEYPAIR_PATH" default:""`

	// SignerURL delegates all chain signing to services/signer. When set,
	// ETH_RELAYER_PRIVATE_KEY and SOLANA_RELAYER_KEYPAIR_PATH are ignored —
	// this process never sees a key.
	//
	// The client certificate is what the signer authenticates by; there is no
	// token fallback, deliberately, because a bearer token can be replayed by
	// anyone who observes one and the thing being authorised is mint
	// authority.
	SignerURL      string `env:"SIGNER_URL" default:""`
	SignerCertPath string `env:"SIGNER_CLIENT_CERT_PATH" default:""`
	SignerKeyPath  string `env:"SIGNER_CLIENT_KEY_PATH" default:""`
	SignerCAPath   string `env:"SIGNER_CA_PATH" default:""`
	SignerEthKeyID string `env:"SIGNER_ETH_KEY_ID" default:"eth-relayer"`
	SignerSolKeyID string `env:"SIGNER_SOL_KEY_ID" default:"sol-relayer"`

	FeeIssuanceBps   int32 `env:"FEE_ISSUANCE_BPS" default:"0"`
	FeeRedemptionBps int32 `env:"FEE_REDEMPTION_BPS" default:"0"`
	FeeTransferBps   int32 `env:"FEE_TRANSFER_BPS" default:"0"`
	FeeWithdrawalBps int32 `env:"FEE_WITHDRAWAL_BPS" default:"0"`

	// WorkerPort keeps the worker's probe/metrics listener off the API's port
	// so both can run in one docker-compose network namespace.
	WorkerPort int `env:"WORKER_PORT" default:"8181"`

	// WorkerConcurrency is how many sagas one replica runs at once. Each is
	// mostly a wait on chain finality rather than CPU work.
	WorkerConcurrency int `env:"WORKER_CONCURRENCY" default:"4"`

	// ChainFinality is the vocabulary both chain clients share: "finalized",
	// or an Ethereum confirmation count like "12". Local chains finalize
	// instantly; Sepolia's `finalized` checkpoint is ~15 minutes behind, which
	// is worth overriding in a demo.
	ChainFinality string `env:"CHAIN_FINALITY" default:"finalized"`

	// OutboxRelayURL is where the relay POSTs ledger events when there is no
	// bus. Empty *and* NATSURL empty disables the relay entirely and events
	// accumulate in the outbox — which is the correct behaviour, not a
	// degraded one: the whole point of the table is that nothing is lost while
	// there is no consumer.
	OutboxRelayURL string `env:"OUTBOX_RELAY_URL" default:""`

	// NATSURL turns the relay's Publisher seam from HTTP into JetStream. P3
	// is where a bus starts paying for itself: bridge_minted now has three
	// independent consumers (saga, compliance, notifications) at a rate the
	// producer doesn't control, which is exactly the situation one HTTP POST
	// to one endpoint cannot serve. When both this and OutboxRelayURL are set,
	// NATS wins and the HTTP URL is ignored — one relay, one destination.
	NATSURL string `env:"NATS_URL" default:""`

	// NATSStream is the JetStream stream that captures damp.> . Created if
	// absent, which keeps a fresh environment to one `docker compose up`.
	NATSStream string `env:"NATS_STREAM" default:"DAMP"`

	// ReconcilePreferSnapshots makes the reconciliation job read chain supply
	// from the indexer's snapshots rather than calling the chains itself.
	// Default off: a deployment with no indexer must not silently reconcile
	// against a table nobody writes.
	ReconcilePreferSnapshots bool `env:"RECONCILE_PREFER_SNAPSHOTS" default:"false"`

	// ReconcileSnapshotMaxAge is how stale an indexer snapshot may be before
	// the job stops trusting it. An indexer that has stopped advancing leaves
	// a perfectly well-formed and increasingly wrong number, and a
	// reconciliation that keeps passing against it is worse than one that
	// fails — it is actively reassuring.
	ReconcileSnapshotMaxAge time.Duration `env:"RECONCILE_SNAPSHOT_MAX_AGE" default:"10m"`

	// IndexerURL points the saga's finality check at services/indexer instead
	// of at an RPC poll. Empty keeps the pre-P3 behaviour exactly, so a
	// deployment with no indexer is unaffected.
	//
	// It is more than a latency improvement (though it is that too: Sepolia's
	// `finalized` checkpoint is ~15 minutes behind, and the indexer answers
	// against a confirmation depth this platform chose). The indexer can tell
	// "not seen yet" from "seen and then orphaned"; an RPC receipt poll
	// cannot, so a reorged mint looked identical to a slow one and the saga
	// would wait for it forever.
	IndexerURL string `env:"INDEXER_URL" default:""`

	// PushgatewayURL is where `reconcile` pushes its gauges. A CronJob pod
	// lives for seconds and can never be scraped, so without this the
	// metric-based paging this phase is built around would silently never
	// fire. Empty is fine for `--watch` and for local runs.
	PushgatewayURL string `env:"PUSHGATEWAY_URL" default:""`
}

func Load() (Config, error) {
	var cfg Config
	if err := platform.LoadConfig(&cfg); err != nil {
		return cfg, err
	}
	if err := cfg.validateFees(); err != nil {
		return cfg, err
	}
	if err := cfg.validateSigning(); err != nil {
		return cfg, err
	}
	return cfg, nil
}

// validateSigning makes the either/or explicit.
//
// Before P6 both key variables were `required`, so a missing one failed at
// boot. Making them optional to allow SIGNER_URL would otherwise mean a
// deployment with neither starts happily and fails at the first mint, hours
// later, in the saga — which is exactly the kind of misconfiguration this
// platform's config loader exists to catch at boot with a readable message.
func (c Config) validateSigning() error {
	if c.SignerURL != "" {
		return nil
	}
	var problems []string
	if c.EthRelayerPrivKey == "" {
		problems = append(problems, "ETH_RELAYER_PRIVATE_KEY: required unless SIGNER_URL is set")
	}
	if c.SolanaRelayerKeypairPath == "" {
		problems = append(problems, "SOLANA_RELAYER_KEYPAIR_PATH: required unless SIGNER_URL is set")
	}
	if len(problems) > 0 {
		problems = append(problems,
			"set SIGNER_URL to delegate signing to services/signer, which is what P6 exists for")
		return &platform.ConfigError{Problems: problems}
	}
	return nil
}

func (c Config) Fees() ledger.FeeSchedule {
	return ledger.FeeSchedule{
		IssuanceBps:   c.FeeIssuanceBps,
		RedemptionBps: c.FeeRedemptionBps,
		TransferBps:   c.FeeTransferBps,
		WithdrawalBps: c.FeeWithdrawalBps,
	}
}

// validateFees enforces the 0-10000bps range platform.LoadConfig's generic int
// parsing doesn't know about, reporting every out-of-range fee together rather
// than one failure at a time.
func (c Config) validateFees() error {
	fees := map[string]int32{
		"FEE_ISSUANCE_BPS":   c.FeeIssuanceBps,
		"FEE_REDEMPTION_BPS": c.FeeRedemptionBps,
		"FEE_TRANSFER_BPS":   c.FeeTransferBps,
		"FEE_WITHDRAWAL_BPS": c.FeeWithdrawalBps,
	}
	var problems []string
	for _, name := range []string{
		"FEE_ISSUANCE_BPS", "FEE_REDEMPTION_BPS", "FEE_TRANSFER_BPS", "FEE_WITHDRAWAL_BPS",
	} {
		if v := fees[name]; v < 0 || v > 10000 {
			problems = append(problems, fmt.Sprintf(
				"%s: must be a whole number of basis points between 0 and 10000, got %d", name, v))
		}
	}
	if len(problems) > 0 {
		return &platform.ConfigError{Problems: problems}
	}
	return nil
}
