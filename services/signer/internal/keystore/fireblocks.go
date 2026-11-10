package keystore

import (
	"context"
	"fmt"
)

// fireblocksBackend is the production answer, stubbed.
//
// It is the plan's choice over AWS KMS for a reason worth restating, because
// it is the kind of constraint that is easy to design around badly: **KMS
// supports secp256k1 but not ed25519**, so Solana cannot use it. The
// alternative to one provider that handles both curves is two providers —
// which doubles the surface on the one thing that must never be wrong, and
// means two rotation procedures, two audit trails and two outages to plan
// for.
//
// What is *not* stubbed is the shape. Fireblocks signs asynchronously: a
// transaction is submitted, an approval policy runs (which may involve a
// human), and the signature arrives later. That does not fit the synchronous
// Sign below, and pretending otherwise here would hide the mismatch until
// somebody tried to use it. The real implementation returns a transaction id
// and the caller polls — which is why core-ledger's saga already treats a
// missing signature as retryable rather than terminal.
type fireblocksBackend struct {
	vaultID string
}

func NewFireblocksBackend(cfg Config) (Backend, error) {
	if cfg.FireblocksAPIKey == "" || cfg.FireblocksSecretPath == "" {
		return nil, fmt.Errorf(
			"the fireblocks backend needs FIREBLOCKS_API_KEY and FIREBLOCKS_SECRET_PATH — " +
				"and is not implemented in this build; use vault for staging")
	}
	return &fireblocksBackend{vaultID: cfg.FireblocksVaultID}, nil
}

func (b *fireblocksBackend) Name() string { return "fireblocks" }

func (b *fireblocksBackend) Keys(context.Context) ([]KeyRef, error) {
	return nil, fmt.Errorf("%w: fireblocks", ErrNotImplemented)
}

func (b *fireblocksBackend) Sign(context.Context, string, []byte) ([]byte, error) {
	// A distinct error rather than a generic failure, so a deployment that
	// selected this backend fails loudly at the first signature instead of
	// looking healthy at boot and stalling every saga afterwards.
	return nil, fmt.Errorf(
		"%w: fireblocks signing is asynchronous (submit, poll for approval) and does not fit this "+
			"synchronous interface — implementing it means giving Backend an async variant, not filling in "+
			"this method", ErrNotImplemented)
}
