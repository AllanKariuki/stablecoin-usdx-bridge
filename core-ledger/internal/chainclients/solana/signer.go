package solana

import (
	"fmt"
	"math/big"

	solanago "github.com/gagliardetto/solana-go"
)

// Signer is the only thing in this package that needs to know how a
// transaction gets authorised, so that P6's signer service is an adapter swap
// rather than a rewrite. bridge.ChainClient does not move.
//
// Solana is the harder of the two swaps, and the reason this seam is opened in
// P2 rather than discovered in P6: solana-go's tx.Sign takes a callback that
// must return the *private key by value*, so a remote signer cannot satisfy
// it at all. Signing therefore goes through the message bytes explicitly
// (see signTransaction), which a remote signer can answer and which is also
// what lets it enforce policy on what it is signing.
type Signer interface {
	// PublicKey is the account the signature will come from — the one
	// configured as RELAYER_PUBKEY in the program's constants.rs, and the
	// only signer bridge_mint/bridge_burn accept.
	PublicKey() solanago.PublicKey

	// Sign returns an ed25519 signature over the serialised transaction
	// message. AWS KMS is why P6 cannot use one provider for both chains: it
	// supports secp256k1 but not ed25519.
	Sign(message []byte) (solanago.Signature, error)
}

// ContextualSigner is optionally implemented by a signer that can make use of
// what is being signed — see the Ethereum package's identical seam for the
// full reasoning. In short: a remote signer enforces amount ceilings and
// destination allowlists, and a serialised message carries none of that in a
// form it can read without re-implementing Anchor's instruction layout.
//
// The client hands over a *copy* bound to this call's values rather than
// setting a field, because the worker runs several sagas concurrently against
// one client and a shared mutable field would race — producing a signature
// authorised against another transfer's amount.
type ContextualSigner interface {
	Signer
	WithSigningContext(method, correlationID string, amount *big.Int, to string) Signer
}

func bindContext(s Signer, method, correlationID string, amount *big.Int, to string) Signer {
	if cs, ok := s.(ContextualSigner); ok {
		return cs.WithSigningContext(method, correlationID, amount, to)
	}
	return s
}

// localSigner holds the keypair in this process, loaded from a
// solana-keygen JSON file. Right for local development, wrong for anything
// holding real mint authority.
type localSigner struct {
	key solanago.PrivateKey
}

func NewLocalSigner(keypairPath string) (Signer, error) {
	key, err := solanago.PrivateKeyFromSolanaKeygenFile(keypairPath)
	if err != nil {
		return nil, fmt.Errorf("loading relayer keypair: %w", err)
	}
	return &localSigner{key: key}, nil
}

func (s *localSigner) PublicKey() solanago.PublicKey { return s.key.PublicKey() }

func (s *localSigner) Sign(message []byte) (solanago.Signature, error) {
	return s.key.Sign(message)
}

// signTransaction attaches signer's signature to tx as the fee payer's.
//
// This replaces tx.Sign(keyResolver). The signature covers the serialised
// message, and its position in tx.Signatures must match the signer's position
// in the message's account keys — Solana matches signatures to accounts by
// index, not by key, so a signature in the wrong slot is rejected as invalid
// rather than as misplaced.
func signTransaction(tx *solanago.Transaction, signer Signer) error {
	message, err := tx.Message.MarshalBinary()
	if err != nil {
		return fmt.Errorf("serialising transaction message: %w", err)
	}

	signerIndex := -1
	for i, key := range tx.Message.AccountKeys {
		if key.Equals(signer.PublicKey()) {
			signerIndex = i
			break
		}
	}
	if signerIndex < 0 {
		return fmt.Errorf("signer %s is not among the transaction's account keys", signer.PublicKey())
	}
	if signerIndex >= int(tx.Message.Header.NumRequiredSignatures) {
		return fmt.Errorf("signer %s appears at account index %d, outside the %d required signers",
			signer.PublicKey(), signerIndex, tx.Message.Header.NumRequiredSignatures)
	}

	signature, err := signer.Sign(message)
	if err != nil {
		return fmt.Errorf("signing transaction: %w", err)
	}

	if len(tx.Signatures) < int(tx.Message.Header.NumRequiredSignatures) {
		tx.Signatures = make([]solanago.Signature, tx.Message.Header.NumRequiredSignatures)
	}
	tx.Signatures[signerIndex] = signature
	return nil
}
