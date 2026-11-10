// Package solana reads the usdx_bridge program's activity on devnet.
//
// Solana's indexing model is not Ethereum's and this package does not pretend
// otherwise. There are no logs to filter by topic: an Anchor `emit!` becomes a
// base64 blob in a transaction's log messages, and the only way to enumerate a
// program's activity is to walk its signature history. So Events walks
// getSignaturesForAddress backwards from the tip until it reaches a slot the
// cursor has already passed, which is the shape the RPC actually supports.
//
// "Height" means slot throughout, and a slot is not a block: Solana skips
// slots, so the indexer must treat a missing slot as ordinary rather than as a
// gap in the chain. Reorgs below the `finalized` commitment do not happen —
// which is why this source reports finalized slots and the tailer's
// confirmation depth for Solana is configured to 0.
package solana

import (
	"context"
	"encoding/base64"
	"encoding/binary"
	"fmt"
	"math/big"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/reorg"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

// anchorLogPrefix is what the runtime writes in front of an `emit!`ed event's
// base64 payload.
const anchorLogPrefix = "Program data: "

type Source struct {
	rpc       *rpc.Client
	programID solanago.PublicKey
	mint      solanago.PublicKey

	// maxSignatures bounds one Events call. Solana's signature history is
	// walked newest-first, so a bound is also the batch size.
	maxSignatures int
}

func New(rpcURL, programID, mintAddress string) (*Source, error) {
	pid, err := solanago.PublicKeyFromBase58(programID)
	if err != nil {
		return nil, fmt.Errorf("parsing the usdx_bridge program id: %w", err)
	}
	mint, err := solanago.PublicKeyFromBase58(mintAddress)
	if err != nil {
		return nil, fmt.Errorf("parsing the USD-X mint address: %w", err)
	}
	return &Source{rpc: rpc.New(rpcURL), programID: pid, mint: mint, maxSignatures: 200}, nil
}

func (s *Source) Chain() string { return "SOLANA" }

// Head is the latest *finalized* slot, not the latest processed one. Reading
// the processed tip would hand the indexer slots that can still be dropped,
// which is the one thing this source's comment above promises it does not do.
func (s *Source) Head(ctx context.Context) (uint64, error) {
	return s.rpc.GetSlot(ctx, rpc.CommitmentFinalized)
}

// HeaderAt makes a slot look like a block header so one reorg implementation
// serves both chains.
//
// A skipped slot — Solana produces them routinely — has no block at all. It is
// reported as a synthetic header whose hash is derived from the slot number,
// which keeps the tailer's parent-hash comparison consistent (a skipped slot
// compares equal to itself on every pass) without inventing a block that
// existed.
func (s *Source) HeaderAt(ctx context.Context, height uint64) (reorg.Header, error) {
	rewards := false
	block, err := s.rpc.GetBlockWithOpts(ctx, height, &rpc.GetBlockOpts{
		Commitment:                     rpc.CommitmentFinalized,
		TransactionDetails:             rpc.TransactionDetailsNone,
		Rewards:                        &rewards,
		MaxSupportedTransactionVersion: &maxTxVersion,
	})
	if err != nil {
		if isSkippedSlot(err) {
			return reorg.Header{
				Height:     height,
				Hash:       fmt.Sprintf("skipped:%d", height),
				ParentHash: fmt.Sprintf("skipped:%d", height-1),
			}, nil
		}
		return reorg.Header{}, err
	}
	return reorg.Header{
		Height:     height,
		Hash:       block.Blockhash.String(),
		ParentHash: block.PreviousBlockhash.String(),
	}, nil
}

var maxTxVersion uint64 = 0

// isSkippedSlot recognises the RPC's several ways of saying "nothing was
// produced here". Treating one of them as a hard error would stall the tailer
// on an entirely healthy chain.
func isSkippedSlot(err error) bool {
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "was skipped") ||
		strings.Contains(msg, "slot was skipped") ||
		strings.Contains(msg, "not available") ||
		strings.Contains(msg, "missing")
}

// Events walks the program's signature history down to `from`.
//
// Newest-first is the only direction getSignaturesForAddress offers, so the
// result is reversed before it is returned: a consumer reading the batch in
// order must see a burn before the mint that answers it.
func (s *Source) Events(ctx context.Context, from, to uint64) ([]store.Event, error) {
	sigs, err := s.rpc.GetSignaturesForAddressWithOpts(ctx, s.programID, &rpc.GetSignaturesForAddressOpts{
		Limit:      &s.maxSignatures,
		Commitment: rpc.CommitmentFinalized,
	})
	if err != nil {
		return nil, fmt.Errorf("reading the program's signature history: %w", err)
	}

	var out []store.Event
	for _, sig := range sigs {
		if sig.Slot < from {
			// The history is ordered newest-first, so the first signature
			// below the range means everything after it is older still.
			break
		}
		if sig.Slot > to || sig.Err != nil {
			// A failed transaction changed no state; indexing it would put
			// a mint in the record that never happened.
			continue
		}

		events, terr := s.eventsInTx(ctx, sig.Signature, sig.Slot)
		if terr != nil {
			return nil, terr
		}
		out = append(out, events...)
	}

	// Reverse into chain order.
	for i, j := 0, len(out)-1; i < j; i, j = i+1, j-1 {
		out[i], out[j] = out[j], out[i]
	}
	return out, nil
}

func (s *Source) eventsInTx(ctx context.Context, sig solanago.Signature, slot uint64) ([]store.Event, error) {
	tx, err := s.rpc.GetTransaction(ctx, sig, &rpc.GetTransactionOpts{
		Commitment:                     rpc.CommitmentFinalized,
		MaxSupportedTransactionVersion: &maxTxVersion,
	})
	if err != nil {
		return nil, fmt.Errorf("reading transaction %s: %w", sig, err)
	}
	if tx == nil || tx.Meta == nil {
		return nil, nil
	}

	var out []store.Event
	for i, line := range tx.Meta.LogMessages {
		if !strings.HasPrefix(line, anchorLogPrefix) {
			continue
		}
		raw, derr := base64.StdEncoding.DecodeString(strings.TrimPrefix(line, anchorLogPrefix))
		if derr != nil || len(raw) < 8 {
			continue
		}

		name, payload := decodeAnchorEvent(raw)
		if name == "" {
			continue
		}
		out = append(out, store.Event{
			ID:            fmt.Sprintf("sol:%s:%d", sig.String(), i),
			Chain:         s.Chain(),
			EventType:     name,
			Contract:      s.programID.String(),
			BlockHeight:   slot,
			BlockHash:     fmt.Sprintf("slot:%d", slot),
			TxHash:        sig.String(),
			LogIndex:      i,
			CorrelationID: stringField(payload, "correlation_id"),
			Payload:       payload,
			BlockTime:     blockTime(tx),
		})
	}
	return out, nil
}

// decodeAnchorEvent recognises usdx_bridge's two events by their Anchor
// discriminator and decodes the Borsh body.
//
// It is a hand-written decoder against the program's own event structs
// (chains/solana/programs/usdx_bridge/src/lib.rs), the same way
// core-ledger's Solana client hand-builds its instructions rather than
// generating from an IDL. An unrecognised discriminator returns "" and the
// log is skipped, so a new event added to the program is invisible here until
// it is added — visible-but-wrong is the failure mode worth avoiding.
func decodeAnchorEvent(raw []byte) (string, map[string]any) {
	body := raw[8:]
	var disc [8]byte
	copy(disc[:], raw[:8])

	switch disc {
	case eventDiscriminator("BridgeMinted"):
		return "BridgeMinted", decodeBridgeEvent(body)
	case eventDiscriminator("BridgeBurned"):
		return "BridgeBurned", decodeBridgeEvent(body)
	}
	return "", nil
}

// decodeBridgeEvent reads Borsh: pubkey (32 bytes), u64 amount
// (little-endian), correlation_id ([u8; 32]).
func decodeBridgeEvent(body []byte) map[string]any {
	const want = 32 + 8 + 32
	if len(body) < want {
		return map[string]any{"decode_error": fmt.Sprintf("expected %d bytes, got %d", want, len(body))}
	}
	var account solanago.PublicKey
	copy(account[:], body[:32])
	amount := binary.LittleEndian.Uint64(body[32:40])

	return map[string]any{
		"account": account.String(),
		// A decimal string, never a JSON number: USD-X is in 1e-6 units and a
		// u64 can exceed 2^53, where a JavaScript consumer would silently
		// round it.
		"amount":         new(big.Int).SetUint64(amount).String(),
		"correlation_id": fmt.Sprintf("0x%x", body[40:72]),
	}
}

// eventDiscriminator is Anchor's event discriminator: the first 8 bytes of
// sha256("event:<EventName>"). Mirrors core-ledger's anchorDiscriminator,
// which does the same for instructions with the "global:" prefix.
func eventDiscriminator(name string) [8]byte {
	sum := sha256Sum("event:" + name)
	var out [8]byte
	copy(out[:], sum[:8])
	return out
}

// TotalSupply reads the SPL mint's own supply.
//
// The mint account is the ground truth Leg A is defined against, the same way
// USDX.totalSupply() is on Ethereum. Deriving it by summing indexed events
// would be checking the indexer against itself.
func (s *Source) TotalSupply(ctx context.Context) (*big.Int, uint64, error) {
	res, err := s.rpc.GetTokenSupply(ctx, s.mint, rpc.CommitmentFinalized)
	if err != nil {
		return nil, 0, fmt.Errorf("reading the USD-X mint supply: %w", err)
	}
	supply, ok := new(big.Int).SetString(res.Value.Amount, 10)
	if !ok {
		return nil, 0, fmt.Errorf("mint supply %q is not an integer", res.Value.Amount)
	}
	return supply, res.Context.Slot, nil
}

func stringField(m map[string]any, key string) string {
	if m == nil {
		return ""
	}
	s, _ := m[key].(string)
	return s
}
