package keystore

import (
	"context"
	"crypto/ecdsa"
	"crypto/ed25519"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/mr-tron/base58"
)

// localBackend holds keys in this process's memory.
//
// It exists for one reason: so that `make up` produces a working platform on
// a laptop without a Vault. Resolve refuses to build it outside ENV=local,
// because a deployment that fell back to this would have moved the key from
// core-ledger's memory into the signer's memory and called it custody.
type localBackend struct {
	ethKey *ecdsa.PrivateKey
	solKey ed25519.PrivateKey
}

const (
	KeyEthRelayer = "eth-relayer"
	KeySolRelayer = "sol-relayer"
)

func NewLocalBackend(cfg Config) (Backend, error) {
	b := &localBackend{}

	if cfg.EthPrivateKeyHex != "" {
		key, err := crypto.HexToECDSA(strings.TrimPrefix(cfg.EthPrivateKeyHex, "0x"))
		if err != nil {
			return nil, fmt.Errorf("parsing the local Ethereum key: %w", err)
		}
		b.ethKey = key
	}

	if cfg.SolKeypairPath != "" {
		key, err := loadSolanaKeypair(cfg.SolKeypairPath)
		if err != nil {
			return nil, err
		}
		b.solKey = key
	}

	if b.ethKey == nil && b.solKey == nil {
		return nil, fmt.Errorf("the local backend was selected but neither key is configured")
	}
	return b, nil
}

func (b *localBackend) Name() string { return "local" }

func (b *localBackend) Keys(context.Context) ([]KeyRef, error) {
	var keys []KeyRef
	if b.ethKey != nil {
		keys = append(keys, KeyRef{
			ID:        KeyEthRelayer,
			Curve:     Secp256k1,
			PublicKey: crypto.PubkeyToAddress(b.ethKey.PublicKey).Hex(),
			Backend:   b.Name(),
		})
	}
	if b.solKey != nil {
		keys = append(keys, KeyRef{
			ID:        KeySolRelayer,
			Curve:     Ed25519,
			PublicKey: base58.Encode(b.solKey.Public().(ed25519.PublicKey)),
			Backend:   b.Name(),
		})
	}
	return keys, nil
}

func (b *localBackend) Sign(_ context.Context, keyID string, digest []byte) ([]byte, error) {
	switch keyID {
	case KeyEthRelayer:
		if b.ethKey == nil {
			return nil, ErrUnknownKey
		}
		// crypto.Sign wants exactly 32 bytes and will happily produce a
		// signature over the wrong thing if handed anything else, so the
		// length is checked rather than assumed.
		if len(digest) != 32 {
			return nil, fmt.Errorf("secp256k1 signing needs a 32-byte digest, got %d", len(digest))
		}
		return crypto.Sign(digest, b.ethKey)

	case KeySolRelayer:
		if b.solKey == nil {
			return nil, ErrUnknownKey
		}
		// ed25519 signs the whole message, not a digest of it — Solana
		// verifies over the serialised transaction message. Pre-hashing here
		// would produce a signature the chain rejects.
		return ed25519.Sign(b.solKey, digest), nil

	default:
		return nil, ErrUnknownKey
	}
}

// loadSolanaKeypair reads a solana-keygen JSON file: a 64-element array of
// bytes, seed then public key.
func loadSolanaKeypair(path string) (ed25519.PrivateKey, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("reading the Solana keypair: %w", err)
	}
	var bytes []byte
	if err := json.Unmarshal(raw, &bytes); err != nil {
		return nil, fmt.Errorf("parsing the Solana keypair (expected a JSON byte array): %w", err)
	}
	if len(bytes) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("a solana keypair is %d bytes, got %d", ed25519.PrivateKeySize, len(bytes))
	}
	return ed25519.PrivateKey(bytes), nil
}
