// Package decode derives what a signing request is actually asking for from
// the bytes that will be signed.
//
// The policy engine reasons about a method, an amount and a destination. If
// those are fields the caller wrote next to the bytes, then policy only
// constrains a caller that is honest about what it is signing, and the whole
// threat model is a caller that is not. So the signer reads them out of the
// transaction itself: the caller's own claims are cross-checked against what
// was decoded and any disagreement is a refusal, never a quiet preference for
// one side.
//
// Everything here is a pure function of bytes. A decoder you cannot run
// against a hostile fixture is one nobody has tried to fool.
package decode

import (
	"bytes"
	"errors"
	"fmt"
	"math/big"
	"strings"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// Decoded is what the bytes say, as opposed to what the caller said.
type Decoded struct {
	Method string
	// Amount in smallest units; nil for methods that move no value.
	Amount *big.Int
	// Destination is the address the method acts on: a mint recipient, a burn
	// source, a blacklist target. Empty for pause/unpause.
	Destination string
	// Target is the contract (Ethereum) or program (Solana) being called.
	Target string
}

var (
	selMint      = selector("bridgeMint(address,uint256,bytes32)")
	selBurn      = selector("bridgeBurn(address,uint256,bytes32)")
	selBlacklist = selector("blacklist(address)")
	selPause     = selector("pause()")
	selUnpause   = selector("unpause()")
)

func selector(sig string) [4]byte {
	var out [4]byte
	copy(out[:], crypto.Keccak256([]byte(sig))[:4])
	return out
}

// Ethereum decodes an unsigned transaction and proves it is the thing the
// digest commits to.
//
// The digest check is the load-bearing line: without it a caller could send a
// harmless 1-unit mint as `rawTx` and the hash of a 10-million-unit one as the
// digest.
func Ethereum(rawTx, digest []byte) (*Decoded, error) {
	if len(rawTx) == 0 {
		return nil, errors.New("ethereum requests must carry the unsigned transaction so the signer can verify what it signs")
	}
	var tx types.Transaction
	if err := tx.UnmarshalBinary(rawTx); err != nil {
		return nil, fmt.Errorf("the transaction does not decode: %w", err)
	}
	chainID := tx.ChainId()
	if chainID == nil || chainID.Sign() == 0 {
		// An unprotected legacy transaction is replayable on every chain.
		return nil, errors.New("the transaction carries no chain id; refusing to sign a replayable transaction")
	}
	hash := types.LatestSignerForChainID(chainID).Hash(&tx)
	if !bytes.Equal(hash[:], digest) {
		return nil, errors.New("the digest is not the hash of the transaction that was sent")
	}
	if tx.To() == nil {
		return nil, errors.New("contract creation is never signed by this service")
	}
	if tx.Value().Sign() != 0 {
		return nil, errors.New("the transaction transfers ETH; the bridge methods never should")
	}

	data := tx.Data()
	if len(data) < 4 {
		return nil, errors.New("the transaction has no calldata")
	}
	var sel [4]byte
	copy(sel[:], data[:4])
	args := data[4:]
	d := &Decoded{Target: tx.To().Hex()}

	switch sel {
	case selMint, selBurn:
		if len(args) != 96 {
			return nil, fmt.Errorf("bridge call has %d argument bytes, want 96", len(args))
		}
		addr, err := word2Address(args[0:32])
		if err != nil {
			return nil, err
		}
		d.Method, d.Destination = "bridgeMint", addr
		if sel == selBurn {
			d.Method = "bridgeBurn"
		}
		d.Amount = new(big.Int).SetBytes(args[32:64])
	case selBlacklist:
		if len(args) != 32 {
			return nil, fmt.Errorf("blacklist has %d argument bytes, want 32", len(args))
		}
		addr, err := word2Address(args[0:32])
		if err != nil {
			return nil, err
		}
		d.Method, d.Destination = "blacklist", addr
	case selPause:
		if len(args) != 0 {
			return nil, errors.New("pause takes no arguments")
		}
		d.Method = "pause"
	case selUnpause:
		if len(args) != 0 {
			return nil, errors.New("unpause takes no arguments")
		}
		d.Method = "unpause"
	default:
		// Default deny at the decoder as well as in policy: a selector nobody
		// listed is not a method policy could have a rule for.
		return nil, fmt.Errorf("unknown method selector 0x%x", sel)
	}
	return d, nil
}

func word2Address(w []byte) (string, error) {
	if !bytes.Equal(w[:12], make([]byte, 12)) {
		return "", errors.New("address argument has non-zero upper bytes")
	}
	return common.BytesToAddress(w[12:]).Hex(), nil
}

// Reconcile compares what the caller claimed with what was decoded. An empty
// claim is acceptable; a conflicting one is an error.
func Reconcile(d *Decoded, claimedMethod, claimedAmount, claimedDestination string) error {
	if claimedMethod != "" && claimedMethod != d.Method {
		return fmt.Errorf("caller claimed method %q but the transaction is %q", claimedMethod, d.Method)
	}
	if claimedAmount != "" {
		a, ok := new(big.Int).SetString(claimedAmount, 10)
		if !ok || d.Amount == nil || a.Cmp(d.Amount) != 0 {
			return fmt.Errorf("caller claimed amount %q but the transaction carries %v", claimedAmount, d.Amount)
		}
	}
	if claimedDestination != "" && !strings.EqualFold(claimedDestination, d.Destination) {
		return fmt.Errorf("caller claimed destination %q but the transaction acts on %q", claimedDestination, d.Destination)
	}
	return nil
}
