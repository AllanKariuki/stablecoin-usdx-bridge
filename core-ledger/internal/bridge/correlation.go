package bridge

import "crypto/sha256"

// CorrelationIDHash maps a string correlation ID to the 32-byte value both
// chain contracts expect (bytes32 correlationId on Ethereum, [u8;32] on
// Solana) — the same hash on both chains, so a given transfer's on-chain
// identifier is identical everywhere rather than chain-specific.
func CorrelationIDHash(correlationID string) [32]byte {
	return sha256.Sum256([]byte(correlationID))
}
