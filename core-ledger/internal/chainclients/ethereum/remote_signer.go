package ethereum

import (
	"context"
	"fmt"
	"math/big"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/signerclient"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// remoteSigner satisfies Signer by asking services/signer.
//
// The Ethereum swap is the clean one, as P2 predicted:
// `bind.TransactOpts.Signer` was already the right hook, so `transactorFor`
// is unchanged and nothing in client.go knows this exists.
//
// What this does that a local key cannot: the transaction is decoded before
// it leaves, so the signer can enforce an amount ceiling and a destination
// allowlist against what is actually being authorised. That is why the seam
// takes a whole transaction rather than a digest — an allowlist against 32
// bytes of hash authorises nothing in particular.
type remoteSigner struct {
	client  *signerclient.Client
	keyID   string
	address common.Address

	// What this call is authorising. Set by WithSigningContext on a copy, so
	// concurrent sagas never share it.
	method        string
	correlationID string
	amount        *big.Int
	to            string
}

// WithSigningContext returns a copy bound to one call's decoded transaction.
//
// A transaction alone does not say whether it is a mint or a burn — the ABI
// calldata does, and decoding it here would duplicate the generated bindings
// the client already has. So the client, which knows what it is calling,
// says so.
func (s *remoteSigner) WithSigningContext(method, correlationID string, amount *big.Int, to string) Signer {
	bound := *s
	bound.method = method
	bound.correlationID = correlationID
	bound.amount = amount
	bound.to = to
	return &bound
}

// NewRemoteSigner builds a signer backed by services/signer.
//
// address is read from the signer's own /keys rather than configured
// separately: core-ledger no longer holds the key, so it has no way to derive
// the address, and a second configured copy would be a second thing to get
// wrong during a rotation.
func NewRemoteSigner(ctx context.Context, client *signerclient.Client, keyID string) (Signer, error) {
	keys, err := client.Keys(ctx)
	if err != nil {
		return nil, fmt.Errorf("reading the relayer address from the signer: %w", err)
	}
	hexAddr, ok := keys[keyID]
	if !ok {
		return nil, fmt.Errorf("the signer holds no key %q", keyID)
	}
	if !common.IsHexAddress(hexAddr) {
		return nil, fmt.Errorf("the signer returned %q for %s, which is not an Ethereum address", hexAddr, keyID)
	}
	return &remoteSigner{client: client, keyID: keyID, address: common.HexToAddress(hexAddr)}, nil
}

func (s *remoteSigner) Address() common.Address { return s.address }

func (s *remoteSigner) SignTx(tx *types.Transaction, chainID *big.Int) (*types.Transaction, error) {
	signer := types.LatestSignerForChainID(chainID)
	// The digest is what Ethereum actually signs: the RLP hash of the
	// transaction under this chain id. Computing it here rather than sending
	// the whole transaction keeps the signer chain-agnostic — it signs bytes
	// and enforces policy on the decoded fields sent alongside.
	digest := signer.Hash(tx)

	result, err := s.client.Sign(context.Background(), signerclient.SignRequest{
		Chain:         "ETHEREUM",
		Method:        s.method,
		KeyID:         s.keyID,
		Digest:        digest[:],
		Amount:        s.amount,
		Destination:   s.to,
		CorrelationID: s.correlationID,
	})
	if err != nil {
		return nil, err
	}

	// 65 bytes: [R || S || V]. go-ethereum's WithSignature expects exactly
	// that layout, and a DER-encoded signature — which some KMS backends
	// return — would be silently accepted as garbage rather than rejected.
	if len(result.Signature) != 65 {
		return nil, fmt.Errorf(
			"the signer returned %d bytes; Ethereum needs a 65-byte [R||S||V] signature "+
				"(a DER signature from a KMS backend needs converting, including recovering V)",
			len(result.Signature))
	}

	return tx.WithSignature(signer, result.Signature)
}
