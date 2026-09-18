package ledger

import (
	"math/big"
	"time"
)

type TransferStatus string

const (
	StatusPending       TransferStatus = "PENDING"
	StatusBurnConfirmed TransferStatus = "BURN_CONFIRMED"
	StatusMintSubmitted TransferStatus = "MINT_SUBMITTED"
	StatusCompleted     TransferStatus = "COMPLETED"
	StatusFailed        TransferStatus = "FAILED"
	StatusCompensated   TransferStatus = "COMPENSATED" // failed mint, re-minted on source
)

// gorm tags below are for query-time type mapping (column names, the
// *big.Int serializer) only. Schema itself — constraints, defaults,
// indexes — is owned by the SQL files under migrations/ (goose), not by
// these structs.
type BridgeTransfer struct {
	CorrelationID string         `gorm:"column:correlation_id;primaryKey"`
	UserAddress   string         `gorm:"column:user_address"`
	Amount        *big.Int       `gorm:"column:amount;serializer:bigint"`
	SourceChain   string         `gorm:"column:source_chain"` // "" (fresh mint) | "ETHEREUM" | "SOLANA"
	TargetChain   string         `gorm:"column:target_chain"` // dictated by client's target_chain field
	Status        TransferStatus `gorm:"column:status"`
	SourceTxHash  string         `gorm:"column:source_tx_hash"`
	DestTxHash    string         `gorm:"column:dest_tx_hash"`
	CreatedAt     time.Time      `gorm:"column:created_at;autoCreateTime"`
	UpdatedAt     time.Time      `gorm:"column:updated_at;autoUpdateTime"`
}

// EthSupplySnapshot, SolSupplySnapshot, and TrustBankSnapshot mirror tables
// defined in migrations/00001_init_schema.sql.

type EthSupplySnapshot struct {
	BlockNumber uint64    `gorm:"column:block_number;primaryKey"`
	TotalSupply *big.Int  `gorm:"column:total_supply;serializer:bigint"`
	CapturedAt  time.Time `gorm:"column:captured_at;autoCreateTime"`
}

func (EthSupplySnapshot) TableName() string { return "eth_supply_snapshot" }

type SolSupplySnapshot struct {
	Slot        uint64    `gorm:"column:slot;primaryKey"`
	TotalSupply *big.Int  `gorm:"column:total_supply;serializer:bigint"`
	CapturedAt  time.Time `gorm:"column:captured_at;autoCreateTime"`
}

func (SolSupplySnapshot) TableName() string { return "sol_supply_snapshot" }

// TrustBankSnapshot rows are inserted upstream by DAMP's Bank Adapter
// service (not part of this repo) as it observes the custodian account.
type TrustBankSnapshot struct {
	AsOf    time.Time `gorm:"column:as_of;primaryKey"`
	Balance *big.Int  `gorm:"column:balance;serializer:bigint"`
}

func (TrustBankSnapshot) TableName() string { return "trust_bank_snapshot" }

type MintRequest struct {
	UserAddress string `json:"user_address"`
	// Amount is a decimal dollar string, e.g. "1000000.00" — matching the
	// DAMP spec's example payloads. See DecimalAmount for the conversion to
	// USD-X's smallest unit (6 decimals, matching both chains).
	Amount      DecimalAmount `json:"amount"`
	SourceChain string        `json:"source_chain"`
	TargetChain string        `json:"target_chain"`
}
