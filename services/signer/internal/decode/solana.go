package decode

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"

	bin "github.com/gagliardetto/binary"
	solanago "github.com/gagliardetto/solana-go"
)

// Account positions in usdx_bridge's bridge_mint / bridge_burn, in the order
// the Anchor Accounts struct declares them (see chains/solana, bridge_mint.rs).
const (
	acctMint    = 0
	acctToken   = 2 // destination (mint) or source (burn) token account
	acctRelayer = 5
	minAccounts = 8
)

func anchorDisc(name string) [8]byte {
	sum := sha256.Sum256([]byte("global:" + name))
	var out [8]byte
	copy(out[:], sum[:8])
	return out
}

// Solana decodes a serialised legacy message — which is exactly what is
// signed — and checks it contains nothing but the bridge instruction (and the
// idempotent ATA creation that accompanies a mint) for an allowed program.
//
// claimedWallet is the wallet the caller says the instruction acts on. The
// message only carries the associated token account, so the claim is verified
// by deriving ATA(claimedWallet, mint) and requiring it to be the account the
// instruction actually touches.
func Solana(message []byte, programs []string, claimedWallet string) (*Decoded, error) {
	if len(message) == 0 {
		return nil, errors.New("empty message")
	}
	var msg solanago.Message
	if err := msg.UnmarshalWithDecoder(bin.NewBinDecoder(message)); err != nil {
		return nil, fmt.Errorf("the message does not decode: %w", err)
	}
	if msg.IsVersioned() || len(msg.AddressTableLookups) > 0 {
		return nil, errors.New("versioned messages with address lookup tables are not signed by this service")
	}
	// Canonical form: anything the decoder tolerated but that does not
	// re-serialise to the same bytes is something the decoder and the chain
	// might read differently.
	again, err := msg.MarshalLegacy()
	if err != nil || !bytes.Equal(again, message) {
		return nil, errors.New("the message is not in canonical form")
	}

	allowed := map[solanago.PublicKey]bool{}
	for _, p := range programs {
		pk, err := solanago.PublicKeyFromBase58(p)
		if err != nil {
			return nil, fmt.Errorf("configured program %q is not a pubkey", p)
		}
		allowed[pk] = true
	}
	if len(allowed) == 0 {
		return nil, errors.New("no allowed Solana program is configured; refusing to sign")
	}

	var bridge *solanago.CompiledInstruction
	for i := range msg.Instructions {
		ix := &msg.Instructions[i]
		if int(ix.ProgramIDIndex) >= len(msg.AccountKeys) {
			return nil, errors.New("instruction program index out of range")
		}
		prog := msg.AccountKeys[ix.ProgramIDIndex]
		switch {
		case allowed[prog]:
			if bridge != nil {
				return nil, errors.New("more than one bridge instruction in one message")
			}
			bridge = ix
		case prog == solanago.SPLAssociatedTokenAccountProgramID:
			// Only the idempotent create that accompanies a mint.
			if !bytes.Equal(ix.Data, []byte{1}) {
				return nil, errors.New("only the idempotent associated-token-account create is allowed")
			}
		default:
			return nil, fmt.Errorf("the message calls program %s, which is not allowed", prog)
		}
	}
	if bridge == nil {
		return nil, errors.New("the message contains no bridge instruction")
	}

	if len(bridge.Data) != 8+8+32 {
		return nil, fmt.Errorf("bridge instruction data is %d bytes, want 48", len(bridge.Data))
	}
	var disc [8]byte
	copy(disc[:], bridge.Data[:8])
	d := &Decoded{Target: msg.AccountKeys[bridge.ProgramIDIndex].String()}
	switch disc {
	case anchorDisc("bridge_mint"):
		d.Method = "bridgeMint"
	case anchorDisc("bridge_burn"):
		d.Method = "bridgeBurn"
	default:
		return nil, errors.New("unknown instruction; only bridge_mint and bridge_burn are signed")
	}
	d.Amount = new(big.Int).SetUint64(binary.LittleEndian.Uint64(bridge.Data[8:16]))

	if len(bridge.Accounts) < minAccounts {
		return nil, fmt.Errorf("bridge instruction has %d accounts, want at least %d (is BridgeConfig missing?)",
			len(bridge.Accounts), minAccounts)
	}
	key := func(pos int) (solanago.PublicKey, error) {
		idx := int(bridge.Accounts[pos])
		if idx >= len(msg.AccountKeys) {
			return solanago.PublicKey{}, errors.New("account index out of range")
		}
		return msg.AccountKeys[idx], nil
	}
	mint, err := key(acctMint)
	if err != nil {
		return nil, err
	}
	token, err := key(acctToken)
	if err != nil {
		return nil, err
	}
	relayer, err := key(acctRelayer)
	if err != nil {
		return nil, err
	}
	if len(msg.AccountKeys) == 0 || msg.AccountKeys[0] != relayer || msg.Header.NumRequiredSignatures < 1 {
		return nil, errors.New("the relayer must be the fee payer and a signer")
	}

	wallet, err := solanago.PublicKeyFromBase58(claimedWallet)
	if err != nil {
		return nil, fmt.Errorf("claimed wallet %q is not a pubkey", claimedWallet)
	}
	derived, _, err := solanago.FindAssociatedTokenAddress(wallet, mint)
	if err != nil {
		return nil, err
	}
	if derived != token {
		return nil, fmt.Errorf("the instruction acts on token account %s, which is not %s's account for this mint", token, wallet)
	}
	d.Destination = wallet.String()
	return d, nil
}
