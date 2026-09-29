// Package keystore holds the keys — or, in the shapes that matter, doesn't.
//
// Three backends, and the reason there are three is a constraint the plan
// states outright: **AWS KMS supports secp256k1 but not ed25519**, so Solana
// cannot use it. Splitting custody across two providers doubles the surface
// on the one thing that must never be wrong, which is why the production
// answer is Fireblocks (both curves, one provider) and the staging answer is
// Vault (Transit for ed25519, KV for the secp256k1 key signed in-process).
//
//	local       development only, and it refuses to start outside it
//	vault       Transit for ed25519, KV for secp256k1
//	fireblocks  production, stubbed here — see FireblocksBackend
package keystore

import (
	"context"
	"errors"
	"fmt"
)

// Curve names what a key can sign with. It is not cosmetic: it is the whole
// reason this platform cannot use one cloud KMS for both chains.
type Curve string

const (
	// Secp256k1 is Ethereum's. Every major KMS supports it.
	Secp256k1 Curve = "secp256k1"
	// Ed25519 is Solana's. AWS KMS does not support it, which is the
	// constraint that chose this platform's production signing provider.
	Ed25519 Curve = "ed25519"
)

// KeyRef is a name, never key material. Nothing in this platform outside a
// backend implementation ever holds bytes that could sign.
type KeyRef struct {
	// ID is how a caller asks for a key: "eth-relayer", "sol-relayer".
	ID string
	// Curve determines which chains the key can sign for.
	Curve Curve
	// PublicKey is hex for secp256k1 (an Ethereum address, derived), base58
	// for ed25519 (a Solana pubkey).
	PublicKey string
	// Backend names where it lives, for the audit log — "which key signed
	// this" is not a complete answer without "and where was it held".
	Backend string
}

var (
	// ErrUnknownKey is returned rather than a generic failure so a
	// misconfigured key id is distinguishable from a backend outage. One is
	// fixed by editing config; the other by waking somebody.
	ErrUnknownKey = errors.New("no such key")
	// ErrNotImplemented is what the Fireblocks stub returns. It is a distinct
	// error so a deployment that has selected a backend nobody finished
	// fails loudly at the first signature rather than silently at boot.
	ErrNotImplemented = errors.New("this backend is not implemented")
)

// Backend is the whole surface a key store has to offer.
//
// Note what is absent: there is no Export, no GetPrivateKey, and no way to
// obtain key material at all. That is not an oversight to be filled in later
// — a backend that can export is a backend whose keys can leave, and the
// point of this service is that they cannot.
type Backend interface {
	Name() string

	// Keys lists what this backend holds. Public information only.
	Keys(ctx context.Context) ([]KeyRef, error)

	// Sign returns a signature over digest with the named key.
	//
	// It takes a digest rather than a transaction because by this layer the
	// chain-specific work is done: policy has already inspected the decoded
	// transaction (see internal/policy, and the Signer seam in P2 that passes
	// whole transactions precisely so it can). What reaches a backend is the
	// bytes to sign.
	Sign(ctx context.Context, keyID string, digest []byte) ([]byte, error)
}

// Resolve picks a backend by name, and refuses a configuration that would put
// real mint authority in a process's memory.
func Resolve(name string, env string, cfg Config) (Backend, error) {
	switch name {
	case "local":
		// The guard the plan asks for by name: *"local (refuses to start
		// unless ENV=local)"*. A deployment that forgot to set a backend must
		// not quietly fall back to holding the key itself.
		if env != "local" {
			return nil, fmt.Errorf(
				"the local key backend refuses to run with ENV=%q: it holds private keys in this process's memory, "+
					"which is exactly what services/signer exists to stop. Use vault or fireblocks", env)
		}
		return NewLocalBackend(cfg)
	case "vault":
		return NewVaultBackend(cfg)
	case "fireblocks":
		return NewFireblocksBackend(cfg)
	default:
		return nil, fmt.Errorf("unknown key backend %q (local, vault, fireblocks)", name)
	}
}

// Config is everything the three backends need between them. One struct
// rather than three because the selection happens at boot from one env
// surface, and a per-backend config type would mean parsing env three ways.
type Config struct {
	// local
	EthPrivateKeyHex string
	SolKeypairPath   string

	// vault
	VaultAddr       string
	VaultToken      string
	VaultTransitKey string
	VaultKVPath     string

	// fireblocks
	FireblocksAPIKey     string
	FireblocksSecretPath string
	FireblocksVaultID    string
}
