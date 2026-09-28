package ethereum

import (
	"bytes"
	"crypto/ecdsa"
	"encoding/hex"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// Ethereum's swap is the clean one — bind.TransactOpts.Signer is already the
// right hook — but "already the right hook" is worth asserting rather than
// assuming, because a signature that is subtly wrong reads as a chain
// rejection rather than as a signing bug.

// testKey derives a deterministic keypair from a fixed seed so failures are
// reproducible. Derived rather than written out as a hex literal: a private
// key in a source file is a secret-scanner finding whether or not it guards
// anything, and "it's only a test key" is exactly what every leaked key was
// said to be.
func testKey(t *testing.T, seedByte byte) (*ecdsa.PrivateKey, string) {
	t.Helper()
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = seedByte + byte(i)
	}
	key, err := crypto.ToECDSA(seed)
	if err != nil {
		t.Fatalf("deriving test key: %v", err)
	}
	return key, hex.EncodeToString(crypto.FromECDSA(key))
}

func TestTransactorMatchesKeyedTransactor(t *testing.T) {
	key, keyHex := testKey(t, 1)
	chainID := big.NewInt(11155111) // Sepolia

	signer, err := NewLocalSigner(keyHex)
	if err != nil {
		t.Fatalf("NewLocalSigner: %v", err)
	}
	if want := crypto.PubkeyToAddress(key.PublicKey); signer.Address() != want {
		t.Fatalf("Address() = %s, want %s", signer.Address(), want)
	}

	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID:   chainID,
		Nonce:     7,
		GasTipCap: big.NewInt(1_000_000_000),
		GasFeeCap: big.NewInt(30_000_000_000),
		Gas:       120_000,
		To:        &common.Address{0xba, 0x07, 0xd6},
		Data:      []byte{0xde, 0xad, 0xbe, 0xef},
	})

	reference, err := bind.NewKeyedTransactorWithChainID(key, chainID)
	if err != nil {
		t.Fatalf("building the reference transactor: %v", err)
	}
	want, err := reference.Signer(reference.From, tx)
	if err != nil {
		t.Fatalf("reference signing: %v", err)
	}

	opts := transactorFor(signer, chainID)
	if opts.From != reference.From {
		t.Fatalf("From = %s, want %s", opts.From, reference.From)
	}
	got, err := opts.Signer(opts.From, tx)
	if err != nil {
		t.Fatalf("signing through the Signer seam: %v", err)
	}

	gotV, gotR, gotS := got.RawSignatureValues()
	wantV, wantR, wantS := want.RawSignatureValues()
	if gotV.Cmp(wantV) != 0 || gotR.Cmp(wantR) != 0 || gotS.Cmp(wantS) != 0 {
		t.Fatalf("signature differs from go-ethereum's keyed transactor:\n got v=%s r=%s s=%s\nwant v=%s r=%s s=%s",
			gotV, gotR, gotS, wantV, wantR, wantS)
	}

	gotBytes, err := got.MarshalBinary()
	if err != nil {
		t.Fatalf("encoding: %v", err)
	}
	wantBytes, err := want.MarshalBinary()
	if err != nil {
		t.Fatalf("encoding the reference: %v", err)
	}
	if !bytes.Equal(gotBytes, wantBytes) {
		t.Fatal("the signed transactions are not byte-identical")
	}
}

// A signer asked to authorise a transaction for an address it does not hold
// must refuse. A remote signer will enforce more than this — amount ceilings,
// destination allowlists — but the identity check is the floor, and it belongs
// here rather than only in the service that comes in P6.
func TestTransactorRefusesAnotherSender(t *testing.T) {
	_, keyHex := testKey(t, 1)
	signer, err := NewLocalSigner(keyHex)
	if err != nil {
		t.Fatalf("NewLocalSigner: %v", err)
	}
	opts := transactorFor(signer, big.NewInt(1))

	tx := types.NewTx(&types.DynamicFeeTx{ChainID: big.NewInt(1), Nonce: 1, Gas: 21000})
	if _, err := opts.Signer(common.Address{0x01}, tx); err == nil {
		t.Fatal("signing for an address the signer does not hold must fail")
	}
}
