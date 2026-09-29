package ethereum

import (
	"crypto/ecdsa"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// Signer is the only thing in this package that ever needs to know how a
// transaction gets authorised.
//
// It exists now, with nothing behind it but an in-process key, so that P6's
// signer service is an adapter swap rather than a rewrite: today the key comes
// from ETH_RELAYER_PRIVATE_KEY, tomorrow the same two methods are answered by
// a gRPC call to a process that holds it in Vault or Fireblocks and this file
// is the only one that changes. bridge.ChainClient does not move.
type Signer interface {
	// Address is the account the signature will come from — the one that must
	// hold BRIDGE_ROLE on the USDX contract.
	Address() common.Address

	// SignTx returns tx signed for chainID. Taking the whole transaction,
	// rather than a digest, is what lets a remote signer enforce policy on
	// what it is being asked to authorise: amount ceilings and destination
	// allowlists are meaningless against an opaque 32 bytes.
	SignTx(tx *types.Transaction, chainID *big.Int) (*types.Transaction, error)
}

// ContextualSigner is optionally implemented by a signer that can make use of
// what is being signed.
//
// It exists because a remote signer enforces policy — amount ceilings,
// destination allowlists — and a digest carries none of that. Rather than
// widening Signer (which would force localSigner to carry fields it has no
// use for), a signer that wants the context advertises it, and the client
// hands over a *copy* bound to this call's values.
//
// A copy, not a field set on the shared signer: the worker runs several sagas
// concurrently against one client, and a mutable field would race — with the
// failure mode being a signature authorised against another transfer's
// amount.
type ContextualSigner interface {
	Signer
	WithSigningContext(method, correlationID string, amount *big.Int, to string) Signer
}

// bindContext returns a signer bound to this call's decoded transaction, or
// the signer unchanged if it does not care.
func bindContext(s Signer, method, correlationID string, amount *big.Int, to string) Signer {
	if cs, ok := s.(ContextualSigner); ok {
		return cs.WithSigningContext(method, correlationID, amount, to)
	}
	return s
}

// localSigner holds the key in this process. It is the right implementation
// for local development and the wrong one for anything holding real mint
// authority, which is what P6 is for.
type localSigner struct {
	key     *ecdsa.PrivateKey
	address common.Address
}

// NewLocalSigner builds a signer from a hex-encoded private key.
func NewLocalSigner(relayerKeyHex string) (Signer, error) {
	key, err := crypto.HexToECDSA(strings.TrimPrefix(relayerKeyHex, "0x"))
	if err != nil {
		return nil, fmt.Errorf("parsing relayer private key: %w", err)
	}
	return &localSigner{key: key, address: crypto.PubkeyToAddress(key.PublicKey)}, nil
}

func (s *localSigner) Address() common.Address { return s.address }

func (s *localSigner) SignTx(tx *types.Transaction, chainID *big.Int) (*types.Transaction, error) {
	return types.SignTx(tx, types.LatestSignerForChainID(chainID), s.key)
}

// transactorFor adapts a Signer to what go-ethereum's generated bindings
// expect. bind.TransactOpts.Signer is already the right hook — it is handed
// the sender and the unsigned transaction and returns a signed one — which is
// why the swap in P6 costs nothing here.
func transactorFor(s Signer, chainID *big.Int) *bind.TransactOpts {
	return &bind.TransactOpts{
		From: s.Address(),
		Signer: func(from common.Address, tx *types.Transaction) (*types.Transaction, error) {
			if from != s.Address() {
				return nil, fmt.Errorf("signer holds %s but was asked to sign for %s", s.Address(), from)
			}
			return s.SignTx(tx, chainID)
		},
	}
}
