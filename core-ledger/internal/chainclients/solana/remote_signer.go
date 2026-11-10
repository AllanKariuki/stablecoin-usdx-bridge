package solana

import (
	"context"
	"fmt"
	"math/big"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/signerclient"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/mr-tron/base58"
)

// remoteSigner satisfies Signer by asking services/signer.
//
// Solana is the fiddlier of the two swaps, and the reason the seam was opened
// in P2 rather than discovered now: solana-go's `tx.Sign` takes a callback
// that must return the *private key by value*, which a remote signer cannot
// satisfy at all. P2 replaced it with `signTransaction`, which signs the
// serialised message explicitly — so this implementation is a network call
// and nothing else.
//
// Note what is NOT hashed here. ed25519 signs the message itself; pre-hashing
// would produce a signature the chain rejects. That is also why the signer's
// Sign takes "the bytes to sign" rather than "a digest" in its contract.
type remoteSigner struct {
	client *signerclient.Client
	keyID  string
	pubkey solanago.PublicKey

	// What this call is authorising. Set by WithSigningContext on a copy, so
	// concurrent sagas never share it.
	method        string
	correlationID string
	amount        *big.Int
	to            string
}

func (s *remoteSigner) WithSigningContext(method, correlationID string, amount *big.Int, to string) Signer {
	bound := *s
	bound.method = method
	bound.correlationID = correlationID
	bound.amount = amount
	bound.to = to
	return &bound
}

func NewRemoteSigner(ctx context.Context, client *signerclient.Client, keyID string) (Signer, error) {
	keys, err := client.Keys(ctx)
	if err != nil {
		return nil, fmt.Errorf("reading the relayer pubkey from the signer: %w", err)
	}
	encoded, ok := keys[keyID]
	if !ok {
		return nil, fmt.Errorf("the signer holds no key %q", keyID)
	}

	pubkey, err := solanago.PublicKeyFromBase58(encoded)
	if err != nil {
		// Vault Transit returns ed25519 public keys base64-encoded, not
		// base58. Accepting either is kinder than making every deployment
		// discover the difference through an unparseable pubkey at boot.
		raw, derr := base58.Decode(encoded)
		if derr != nil || len(raw) != 32 {
			return nil, fmt.Errorf("the signer returned %q for %s, which is not a base58 ed25519 pubkey: %w",
				encoded, keyID, err)
		}
		pubkey = solanago.PublicKeyFromBytes(raw)
	}

	return &remoteSigner{client: client, keyID: keyID, pubkey: pubkey}, nil
}

func (s *remoteSigner) PublicKey() solanago.PublicKey { return s.pubkey }

func (s *remoteSigner) Sign(message []byte) (solanago.Signature, error) {
	result, err := s.client.Sign(context.Background(), signerclient.SignRequest{
		Chain:         "SOLANA",
		Method:        s.method,
		KeyID:         s.keyID,
		Digest:        message, // the message itself — ed25519 does not pre-hash
		Amount:        s.amount,
		Destination:   s.to,
		CorrelationID: s.correlationID,
	})
	if err != nil {
		return solanago.Signature{}, err
	}

	if len(result.Signature) != 64 {
		return solanago.Signature{}, fmt.Errorf(
			"the signer returned %d bytes; ed25519 signatures are 64", len(result.Signature))
	}

	var signature solanago.Signature
	copy(signature[:], result.Signature)
	return signature, nil
}
