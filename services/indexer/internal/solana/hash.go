package solana

import (
	"crypto/sha256"
	"time"

	"github.com/gagliardetto/solana-go/rpc"
)

func sha256Sum(s string) []byte {
	sum := sha256.Sum256([]byte(s))
	return sum[:]
}

// blockTime is the chain's own timestamp for the transaction, falling back to
// now when the RPC does not carry one (older ledger entries can have it
// pruned). The fallback is explicit rather than a zero value because
// chain_events partitions on this column — a zero timestamp would land every
// such row in a chunk from year 1.
func blockTime(tx *rpc.GetTransactionResult) time.Time {
	if tx != nil && tx.BlockTime != nil {
		return tx.BlockTime.Time().UTC()
	}
	return time.Now().UTC()
}
