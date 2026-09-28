// Package config is services/indexer's environment surface.
package config

import (
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
)

type Config struct {
	Port     int    `env:"PORT" default:"8083"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	// The indexer's own TimescaleDB — not core-ledger's Postgres. One
	// database per service, isolation by GRANT (docs/building-plan.md).
	DatabaseURL string `env:"DATABASE_URL" required:"true"`

	CoreLedgerURL      string `env:"CORE_LEDGER_URL" required:"true"`
	CoreLedgerSvcToken string `env:"CORE_LEDGER_SERVICE_TOKEN" default:""`

	EthRPCURL        string `env:"ETH_RPC_URL" required:"true"`
	USDXProxyAddress string `env:"USDX_PROXY_ADDRESS" required:"true"`
	// USDXABIPath is read at runtime rather than embedded: the file lives at
	// shared/abi/USDX.json, outside this module, and go:embed cannot cross a
	// module boundary. CI already diffs that file against `forge build`
	// output, so a drifted ABI fails the build rather than producing an
	// indexer that silently decodes nothing.
	USDXABIPath string `env:"USDX_ABI_PATH" default:"/app/abi/USDX.json"`

	SolanaRPCURL    string `env:"SOLANA_RPC_URL" default:"http://localhost:8899"`
	USDXProgramID   string `env:"USDX_PROGRAM_ID" required:"true"`
	USDXMintAddress string `env:"USDX_MINT_ADDRESS" required:"true"`

	// EthConfirmations is how far behind the head Ethereum indexing stays.
	// 12 is the conventional depth at which a Sepolia/mainnet block is
	// treated as settled for value; it is deliberately a number this platform
	// chooses rather than the consensus layer's `finalized` checkpoint, which
	// on Sepolia is ~15 minutes behind and made every mint wait for it.
	EthConfirmations uint64 `env:"ETH_CONFIRMATIONS" default:"12"`

	// SolConfirmations is 0 because this indexer reads Solana at the
	// `finalized` commitment, which is already a supermajority-rooted slot —
	// waiting further behind it would add latency to a guarantee already
	// given.
	SolConfirmations uint64 `env:"SOL_CONFIRMATIONS" default:"0"`

	// ReorgDepth is how many headers are kept for fork resolution. A fork
	// deeper than this is refused rather than absorbed: rewriting history the
	// platform has already minted against is an incident, not a correction.
	ReorgDepth uint64 `env:"REORG_DEPTH" default:"128"`

	// EthStartHeight / SolStartHeight are where a cold cursor begins.
	// Unset means "one reorg window behind the safe head" — indexing a chain
	// from genesis to find a contract deployed last month is days of RPC
	// calls for nothing.
	EthStartHeight uint64 `env:"ETH_START_HEIGHT" default:"0"`
	SolStartHeight uint64 `env:"SOL_START_HEIGHT" default:"0"`

	BatchSize    uint64        `env:"INDEX_BATCH_SIZE" default:"2000"`
	PollInterval time.Duration `env:"INDEX_POLL_INTERVAL" default:"5s"`

	SupplyInterval time.Duration `env:"SUPPLY_REPORT_INTERVAL" default:"60s"`

	// LeaderPoll is how often a standby replica re-tries for the advisory
	// lock. A cursor must advance monotonically, so exactly one replica may
	// hold it — see internal/leader for why this is a Postgres lock rather
	// than the k8s Lease the plan called for.
	LeaderPoll time.Duration `env:"LEADER_POLL_INTERVAL" default:"10s"`

	// DisableSolana lets a deployment run Ethereum-only. Useful when the
	// devnet validator isn't part of the environment — and honest about it,
	// rather than a Solana tailer that errors every five seconds forever.
	DisableSolana bool `env:"DISABLE_SOLANA" default:"false"`
}

func Load() (Config, error) {
	var cfg Config
	if err := platform.LoadConfig(&cfg); err != nil {
		return cfg, err
	}
	return cfg, nil
}
