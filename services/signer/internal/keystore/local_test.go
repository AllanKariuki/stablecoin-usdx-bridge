package keystore

import (
	"context"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/ethereum/go-ethereum/crypto"
)

// A signer that produces a *plausible but wrong* signature is the worst
// outcome available here: the transaction is rejected by the chain with no
// explanation, the saga retries, and the cause is a curve or an encoding
// nobody looked at. So these assert the signatures against what the chains'
// own verifiers accept — not merely that bytes came back.

// Keys are generated per test rather than checked in as literals.
//
// A hardcoded private key in a repository is a hardcoded private key,
// regardless of whether this particular one guards anything — the secret
// scanner in CI is right to refuse it, and an allowlist entry teaching it to
// ignore key-shaped strings in this directory is exactly the exception that
// later hides a real one. Every assertion below is about the signature, and
// none of them needs a *particular* key.
func generateEthKeyHex(t *testing.T) string {
	t.Helper()
	key, err := crypto.GenerateKey()
	if err != nil {
		t.Fatalf("generating a secp256k1 key: %v", err)
	}
	return hex.EncodeToString(crypto.FromECDSA(key))
}

func localBackendForTest(t *testing.T) Backend {
	t.Helper()

	// A solana-keygen file is a 64-byte JSON array: seed then public key.
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generating an ed25519 key: %v", err)
	}
	encoded, err := json.Marshal([]byte(priv))
	if err != nil {
		t.Fatalf("encoding the keypair: %v", err)
	}
	path := filepath.Join(t.TempDir(), "relayer.json")
	if err := os.WriteFile(path, encoded, 0o600); err != nil {
		t.Fatalf("writing the keypair: %v", err)
	}

	backend, err := NewLocalBackend(Config{EthPrivateKeyHex: generateEthKeyHex(t), SolKeypairPath: path})
	if err != nil {
		t.Fatalf("building the local backend: %v", err)
	}
	return backend
}

// The secp256k1 signature must be the 65-byte [R||S||V] form go-ethereum's
// WithSignature expects, and it must recover to the signing address. A DER
// signature — which several KMS backends return — is the same curve and the
// wrong encoding, and would be accepted as garbage rather than rejected.
func TestEthereumSignatureRecoversToTheSigningAddress(t *testing.T) {
	backend := localBackendForTest(t)
	digest := crypto.Keccak256([]byte("a transaction hash"))

	signature, err := backend.Sign(context.Background(), KeyEthRelayer, digest)
	if err != nil {
		t.Fatalf("signing: %v", err)
	}
	if len(signature) != 65 {
		t.Fatalf("signature is %d bytes, want the 65-byte [R||S||V] form", len(signature))
	}

	recovered, err := crypto.SigToPub(digest, signature)
	if err != nil {
		t.Fatalf("recovering the public key: %v", err)
	}

	keys, _ := backend.Keys(context.Background())
	var expected string
	for _, k := range keys {
		if k.ID == KeyEthRelayer {
			expected = k.PublicKey
		}
	}
	if got := crypto.PubkeyToAddress(*recovered).Hex(); got != expected {
		t.Fatalf("the signature recovers to %s, not the key's own address %s", got, expected)
	}
}

// ed25519 signs the message itself. Pre-hashing would produce a signature
// Solana rejects, and the failure would look like an unrelated transaction
// error.
func TestSolanaSignatureVerifiesAgainstTheMessageItself(t *testing.T) {
	backend := localBackendForTest(t)
	message := []byte("a serialised solana transaction message")

	signature, err := backend.Sign(context.Background(), KeySolRelayer, message)
	if err != nil {
		t.Fatalf("signing: %v", err)
	}
	if len(signature) != ed25519.SignatureSize {
		t.Fatalf("signature is %d bytes, want %d", len(signature), ed25519.SignatureSize)
	}

	keys, _ := backend.Keys(context.Background())
	var pubkey string
	for _, k := range keys {
		if k.ID == KeySolRelayer {
			pubkey = k.PublicKey
		}
	}
	if pubkey == "" {
		t.Fatal("the backend reports no Solana key")
	}

	// Verified with the raw ed25519 verifier, which is what the chain does.
	raw := decodeBase58(t, pubkey)
	if !ed25519.Verify(ed25519.PublicKey(raw), message, signature) {
		t.Fatal("the signature does not verify against the message; is something pre-hashing it?")
	}

	// And must NOT verify against a hash of the message, which is the
	// specific mistake this guards against.
	if ed25519.Verify(ed25519.PublicKey(raw), crypto.Keccak256(message), signature) {
		t.Fatal("the signature verifies against a hash of the message, which means it signed the wrong bytes")
	}
}

func TestSigningIsDeterministicForTheSameInput(t *testing.T) {
	// Both curves as used here are deterministic. It matters because the
	// signer replays a stored signature on a retried request, and a
	// nondeterministic one would make "is this the same signature" a question
	// that could not be answered by comparing bytes.
	backend := localBackendForTest(t)
	digest := crypto.Keccak256([]byte("stable"))

	first, err := backend.Sign(context.Background(), KeyEthRelayer, digest)
	if err != nil {
		t.Fatalf("signing: %v", err)
	}
	second, err := backend.Sign(context.Background(), KeyEthRelayer, digest)
	if err != nil {
		t.Fatalf("signing again: %v", err)
	}
	if hex.EncodeToString(first) != hex.EncodeToString(second) {
		t.Fatal("two signatures over the same digest differ")
	}
}

func TestRejectsAWrongLengthDigestForSecp256k1(t *testing.T) {
	// crypto.Sign will happily sign a differently-sized buffer as though it
	// were a digest, producing a valid signature over the wrong thing.
	backend := localBackendForTest(t)
	if _, err := backend.Sign(context.Background(), KeyEthRelayer, []byte("not 32 bytes")); err == nil {
		t.Fatal("a digest of the wrong length was signed")
	}
}

func TestUnknownKeyIsDistinguishable(t *testing.T) {
	// A misconfigured key id is fixed by editing config; a backend outage by
	// waking somebody. Collapsing them into one error means every signing
	// failure looks like the latter.
	backend := localBackendForTest(t)
	_, err := backend.Sign(context.Background(), "no-such-key", make([]byte, 32))
	if err != ErrUnknownKey {
		t.Fatalf("err = %v, want ErrUnknownKey", err)
	}
}

// The guard the plan asks for by name. A deployment that forgot to set a
// backend must not quietly fall back to holding the key itself.
func TestLocalBackendRefusesToRunOutsideLocal(t *testing.T) {
	key := generateEthKeyHex(t)
	for _, env := range []string{"staging", "production", ""} {
		if _, err := Resolve("local", env, Config{EthPrivateKeyHex: key}); err == nil {
			t.Fatalf("the local backend was allowed with ENV=%q", env)
		}
	}
	if _, err := Resolve("local", "local", Config{EthPrivateKeyHex: key}); err != nil {
		t.Fatalf("the local backend was refused in local development: %v", err)
	}
}

func TestUnknownBackendIsRefused(t *testing.T) {
	if _, err := Resolve("kms", "local", Config{}); err == nil {
		t.Fatal("an unknown backend name was accepted")
	}
}

func decodeBase58(t *testing.T, encoded string) []byte {
	t.Helper()
	raw, err := base58Decode(encoded)
	if err != nil {
		t.Fatalf("decoding %q: %v", encoded, err)
	}
	return raw
}
