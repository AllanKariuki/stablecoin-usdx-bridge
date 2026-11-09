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

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform"
)

type Config struct {
	Port     int    `env:"PORT" default:"8081"`
	LogLevel string `env:"LOG_LEVEL" default:"info"`

	DatabaseURL string `env:"DATABASE_URL" required:"true"`

	EthRPCURL         string `env:"ETH_RPC_URL" required:"true"`
	USDXProxyAddress  string `env:"USDX_PROXY_ADDRESS" required:"true"`
	EthRelayerPrivKey string `env:"ETH_RELAYER_PRIVATE_KEY" required:"true"`

	SolanaRPCURL             string `env:"SOLANA_RPC_URL" default:"http://localhost:8899"`
	USDXProgramID            string `env:"USDX_PROGRAM_ID" required:"true"`
	USDXMintAddress          string `env:"USDX_MINT_ADDRESS" required:"true"`
	SolanaRelayerKeypairPath string `env:"SOLANA_RELAYER_KEYPAIR_PATH" required:"true"`

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

	// OutboxRelayURL is where the relay POSTs ledger events. Empty disables
	// the relay entirely and events accumulate in the outbox — which is the
	// correct behaviour, not a degraded one: there is no consumer until the
	// indexer lands in P3, and the whole point of the table is that nothing is
	// lost while there isn't one.
	OutboxRelayURL string `env:"OUTBOX_RELAY_URL" default:""`
}

func Load() (Config, error) {
	var cfg Config
	if err := platform.LoadConfig(&cfg); err != nil {
		return cfg, err
	}
	if err := cfg.validateFees(); err != nil {
		return cfg, err
	}
	return cfg, nil
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
