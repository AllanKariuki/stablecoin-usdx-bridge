package keystore

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
)

// vaultBackend is the staging middle the plan describes: *"Vault (Transit for
// ed25519, KV for the secp256k1 key signed in-process) is the staging
// middle."*
//
// The split is not a design preference, it is Transit's capability surface.
// Vault Transit signs ed25519 natively, so the Solana key genuinely never
// leaves Vault. It does *not* produce the recoverable ECDSA signature
// Ethereum needs — Transit's secp256k1 support emits a DER signature with no
// recovery id, and go-ethereum requires the 65-byte [R||S||V] form — so the
// Ethereum key is read once from KV and signed with in-process.
//
// That is a real, acknowledged weakness of this backend and the reason it is
// labelled staging rather than production: the Ethereum key does briefly
// exist in this process's memory. Fireblocks is the answer that closes it for
// both curves, which is why it is the production choice rather than KMS.
type vaultBackend struct {
	addr       string
	token      string
	transitKey string
	kvPath     string
	http       *http.Client

	// Cached because the KV read is a network round trip and this key is used
	// on every Ethereum signature. Cached for the process lifetime rather
	// than with a TTL: a rotation is a restart, which is also when the policy
	// and the public key the audit log records change.
	ethKey *ecdsa.PrivateKey
}

func NewVaultBackend(cfg Config) (Backend, error) {
	if cfg.VaultAddr == "" || cfg.VaultToken == "" {
		return nil, fmt.Errorf("the vault backend needs VAULT_ADDR and VAULT_TOKEN")
	}
	return &vaultBackend{
		addr:       strings.TrimRight(cfg.VaultAddr, "/"),
		token:      cfg.VaultToken,
		transitKey: orDefault(cfg.VaultTransitKey, "usdx-solana-relayer"),
		kvPath:     orDefault(cfg.VaultKVPath, "secret/data/usdx/eth-relayer"),
		http:       &http.Client{Timeout: 10 * time.Second},
	}, nil
}

func (b *vaultBackend) Name() string { return "vault" }

func (b *vaultBackend) Keys(ctx context.Context) ([]KeyRef, error) {
	var keys []KeyRef

	if pub, err := b.transitPublicKey(ctx); err == nil {
		keys = append(keys, KeyRef{ID: KeySolRelayer, Curve: Ed25519, PublicKey: pub, Backend: b.Name()})
	}
	if key, err := b.ethereumKey(ctx); err == nil {
		keys = append(keys, KeyRef{
			ID:        KeyEthRelayer,
			Curve:     Secp256k1,
			PublicKey: crypto.PubkeyToAddress(key.PublicKey).Hex(),
			Backend:   b.Name(),
		})
	}
	return keys, nil
}

func (b *vaultBackend) Sign(ctx context.Context, keyID string, digest []byte) ([]byte, error) {
	switch keyID {
	case KeySolRelayer:
		// The good case: Vault signs, the key never leaves.
		return b.transitSign(ctx, digest)

	case KeyEthRelayer:
		key, err := b.ethereumKey(ctx)
		if err != nil {
			return nil, err
		}
		if len(digest) != 32 {
			return nil, fmt.Errorf("secp256k1 signing needs a 32-byte digest, got %d", len(digest))
		}
		return crypto.Sign(digest, key)

	default:
		return nil, ErrUnknownKey
	}
}

// transitSign asks Vault to sign, with the key staying inside it.
func (b *vaultBackend) transitSign(ctx context.Context, message []byte) ([]byte, error) {
	body := map[string]any{
		"input": base64.StdEncoding.EncodeToString(message),
		// ed25519 signs the message itself. Asking Vault to pre-hash would
		// produce a signature Solana rejects.
		"prehashed": false,
	}
	var out struct {
		Data struct {
			Signature string `json:"signature"`
		} `json:"data"`
	}
	if err := b.call(ctx, http.MethodPost, "/v1/transit/sign/"+b.transitKey, body, &out); err != nil {
		return nil, err
	}

	// Vault returns "vault:v1:<base64>". The version prefix is stripped here
	// rather than passed on: a chain has no idea what a Vault key version is.
	parts := strings.Split(out.Data.Signature, ":")
	raw, err := base64.StdEncoding.DecodeString(parts[len(parts)-1])
	if err != nil {
		return nil, fmt.Errorf("decoding the Transit signature: %w", err)
	}
	return raw, nil
}

func (b *vaultBackend) transitPublicKey(ctx context.Context) (string, error) {
	var out struct {
		Data struct {
			Keys map[string]struct {
				PublicKey string `json:"public_key"`
			} `json:"keys"`
			LatestVersion int `json:"latest_version"`
		} `json:"data"`
	}
	if err := b.call(ctx, http.MethodGet, "/v1/transit/keys/"+b.transitKey, nil, &out); err != nil {
		return "", err
	}
	version := fmt.Sprintf("%d", out.Data.LatestVersion)
	return out.Data.Keys[version].PublicKey, nil
}

func (b *vaultBackend) ethereumKey(ctx context.Context) (*ecdsa.PrivateKey, error) {
	if b.ethKey != nil {
		return b.ethKey, nil
	}
	var out struct {
		Data struct {
			Data map[string]string `json:"data"`
		} `json:"data"`
	}
	if err := b.call(ctx, http.MethodGet, "/v1/"+strings.TrimLeft(b.kvPath, "/"), nil, &out); err != nil {
		return nil, err
	}
	hex, ok := out.Data.Data["private_key"]
	if !ok {
		return nil, fmt.Errorf("no private_key at %s", b.kvPath)
	}
	key, err := crypto.HexToECDSA(strings.TrimPrefix(hex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("parsing the Ethereum key from Vault: %w", err)
	}
	b.ethKey = key
	return key, nil
}

func (b *vaultBackend) call(ctx context.Context, method, path string, body any, out any) error {
	var reader io.Reader
	if body != nil {
		encoded, err := json.Marshal(body)
		if err != nil {
			return err
		}
		reader = bytes.NewReader(encoded)
	}

	req, err := http.NewRequestWithContext(ctx, method, b.addr+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("X-Vault-Token", b.token)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := b.http.Do(req)
	if err != nil {
		return fmt.Errorf("calling vault %s: %w", path, err)
	}
	defer resp.Body.Close()

	payload, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		// Deliberately does not echo the response body: a Vault error can
		// include the path and, in some configurations, hints about what is
		// stored there.
		return fmt.Errorf("vault %s returned %s", path, resp.Status)
	}
	return json.Unmarshal(payload, out)
}

func orDefault(v, fallback string) string {
	if v == "" {
		return fallback
	}
	return v
}
