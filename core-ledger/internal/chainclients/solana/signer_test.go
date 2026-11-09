package solana

import (
	"bytes"
	"crypto/ed25519"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
)

// Replacing tx.Sign with explicit message signing is the change that lets P6
// put the key in another process, and it is also the change that could
// silently produce transactions the cluster rejects. So the test is an
// equivalence test: for the same transaction, signTransaction must produce
// byte-identical output to solana-go's own signer.
//
// "It still works against devnet" is not the assertion worth making here —
// that would pass just as happily if the signature were right for the wrong
// reason, and would need a validator to run at all.

// fixedKey derives a deterministic keypair so a failure is reproducible
// rather than a one-in-a-run flake.
func fixedKey(t *testing.T, seedByte byte) solanago.PrivateKey {
	t.Helper()
	seed := make([]byte, ed25519.SeedSize)
	for i := range seed {
		seed[i] = seedByte + byte(i)
	}
	return solanago.PrivateKey(ed25519.NewKeyFromSeed(seed))
}

func buildTx(t *testing.T, payer solanago.PublicKey, extra ...solanago.PublicKey) *solanago.Transaction {
	t.Helper()

	accounts := solanago.AccountMetaSlice{solanago.Meta(payer).WRITE().SIGNER()}
	for _, k := range extra {
		accounts = append(accounts, solanago.Meta(k).WRITE())
	}
	instruction := solanago.NewInstruction(
		solanago.MustPublicKeyFromBase58("11111111111111111111111111111111"),
		accounts,
		[]byte{1, 2, 3, 4},
	)

	// A fixed blockhash keeps the message bytes — and therefore the signature
	// — stable across runs.
	blockhash := solanago.MustHashFromBase58("11111111111111111111111111111111")
	tx, err := solanago.NewTransaction([]solanago.Instruction{instruction}, blockhash, solanago.TransactionPayer(payer))
	if err != nil {
		t.Fatalf("building transaction: %v", err)
	}
	return tx
}

func TestSignTransactionMatchesSolanaGo(t *testing.T) {
	cases := []struct {
		name  string
		extra int // additional non-signer accounts, which move the payer's index around
	}{
		{"payer only", 0},
		{"one extra account", 1},
		{"several extra accounts", 4},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			key := fixedKey(t, 1)
			payer := key.PublicKey()

			extra := make([]solanago.PublicKey, 0, tc.extra)
			for i := 0; i < tc.extra; i++ {
				extra = append(extra, fixedKey(t, byte(10+i)).PublicKey())
			}

			// Known good: solana-go signing the transaction itself.
			reference := buildTx(t, payer, extra...)
			if _, err := reference.Sign(func(k solanago.PublicKey) *solanago.PrivateKey {
				if k.Equals(payer) {
					return &key
				}
				return nil
			}); err != nil {
				t.Fatalf("reference signing: %v", err)
			}

			// Under test: the same transaction through the Signer seam.
			mine := buildTx(t, payer, extra...)
			if err := signTransaction(mine, &localSigner{key: key}); err != nil {
				t.Fatalf("signTransaction: %v", err)
			}

			if len(mine.Signatures) != len(reference.Signatures) {
				t.Fatalf("produced %d signatures, want %d", len(mine.Signatures), len(reference.Signatures))
			}
			for i := range reference.Signatures {
				if !bytes.Equal(mine.Signatures[i][:], reference.Signatures[i][:]) {
					t.Fatalf("signature %d differs from solana-go's:\n got %s\nwant %s",
						i, mine.Signatures[i], reference.Signatures[i])
				}
			}

			// And the cluster's own check: the signature verifies against the
			// message it claims to cover.
			if err := mine.VerifySignatures(); err != nil {
				t.Fatalf("verifying signatures: %v", err)
			}
		})
	}
}

// A signer that isn't in the transaction must fail loudly. Silently appending
// its signature would produce a transaction the cluster rejects as invalid,
// which reads as a chain problem rather than a configuration one.
func TestSignTransactionRejectsAStrangerSigner(t *testing.T) {
	payer := fixedKey(t, 1)
	stranger := fixedKey(t, 200)

	tx := buildTx(t, payer.PublicKey())
	err := signTransaction(tx, &localSigner{key: stranger})
	if err == nil {
		t.Fatal("signing with a key the transaction never names must fail")
	}
}
