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

type BridgeTransfer struct {
	CorrelationID string         `db:"correlation_id"`
	UserAddress   string         `db:"user_address"`
	Amount        *big.Int       `db:"amount"`
	SourceChain   string         `db:"source_chain"` // "ETHEREUM" | "SOLANA"
	TargetChain   string         `db:"target_chain"` // dictated by client's target_chain field
	Status        TransferStatus `db:"status"`
	SourceTxHash  string         `db:"source_tx_hash"`
	DestTxHash    string         `db:"dest_tx_hash"`
	CreatedAt     time.Time      `db:"created_at"`
	UpdatedAt     time.Time      `db:"updated_at"`
}

type MintRequest struct {
	UserAddress string   `json:"user_address"`
	Amount      *big.Int `json:"amount"`
	SourceChain string   `json:"source_chain"`
	TargetChain string   `json:"target_chain"`
}
