// Package ethereum reads USD-X's Sepolia contract for the indexer.
//
// It decodes logs generically from shared/abi/USDX.json rather than from
// abigen bindings. Two reasons: the bindings live under core-ledger/internal/
// and are unimportable from here by construction, and the indexer's interest
// is "every event this contract can emit", which is a property of the ABI
// rather than of a hand-picked list — a new event added to USDXV2 in P6 shows
// up here with no code change.
package ethereum

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"os"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/reorg"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"

	ethereum "github.com/ethereum/go-ethereum"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
)

type Source struct {
	ec       *ethclient.Client
	contract common.Address
	abi      abi.ABI

	// topics maps a log's topic0 to the event that produced it — the whole of
	// "which event is this" in one map lookup.
	topics map[common.Hash]abi.Event
}

// New dials rpcURL and loads the ABI from disk.
//
// The ABI is read at runtime from a path rather than embedded because the file
// it comes from (shared/abi/USDX.json) lives outside this module and go:embed
// cannot cross a module boundary. CI already diffs that file against
// `forge build` output, so a drifted ABI fails the build rather than producing
// an indexer that silently decodes nothing.
func New(rpcURL, contractAddress, abiPath string) (*Source, error) {
	raw, err := os.ReadFile(abiPath)
	if err != nil {
		return nil, fmt.Errorf("reading the USDX ABI at %s: %w", abiPath, err)
	}
	parsed, err := parseABI(raw)
	if err != nil {
		return nil, err
	}

	ec, err := ethclient.Dial(rpcURL)
	if err != nil {
		return nil, fmt.Errorf("dialing ethereum rpc: %w", err)
	}

	topics := make(map[common.Hash]abi.Event, len(parsed.Events))
	for _, ev := range parsed.Events {
		topics[ev.ID] = ev
	}

	return &Source{ec: ec, contract: common.HexToAddress(contractAddress), abi: parsed, topics: topics}, nil
}

// parseABI accepts both shapes the file can take: a bare ABI array, or a
// Foundry artifact object with the array under "abi". Guessing wrong produces
// an indexer that decodes nothing and reports success, so both are handled
// explicitly rather than by hoping.
func parseABI(raw []byte) (abi.ABI, error) {
	trimmed := strings.TrimSpace(string(raw))
	if strings.HasPrefix(trimmed, "[") {
		return abi.JSON(strings.NewReader(trimmed))
	}
	var artifact struct {
		ABI json.RawMessage `json:"abi"`
	}
	if err := json.Unmarshal(raw, &artifact); err != nil || len(artifact.ABI) == 0 {
		return abi.ABI{}, fmt.Errorf("the USDX ABI is neither a bare array nor an artifact with an \"abi\" key")
	}
	return abi.JSON(strings.NewReader(string(artifact.ABI)))
}

func (s *Source) Chain() string { return "ETHEREUM" }

func (s *Source) Head(ctx context.Context) (uint64, error) {
	return s.ec.BlockNumber(ctx)
}

func (s *Source) HeaderAt(ctx context.Context, height uint64) (reorg.Header, error) {
	h, err := s.ec.HeaderByNumber(ctx, new(big.Int).SetUint64(height))
	if err != nil {
		return reorg.Header{}, err
	}
	return reorg.Header{
		Height:     h.Number.Uint64(),
		Hash:       h.Hash().Hex(),
		ParentHash: h.ParentHash.Hex(),
	}, nil
}

func (s *Source) Events(ctx context.Context, from, to uint64) ([]store.Event, error) {
	logs, err := s.ec.FilterLogs(ctx, ethereum.FilterQuery{
		FromBlock: new(big.Int).SetUint64(from),
		ToBlock:   new(big.Int).SetUint64(to),
		Addresses: []common.Address{s.contract},
	})
	if err != nil {
		return nil, err
	}

	out := make([]store.Event, 0, len(logs))
	for _, l := range logs {
		// A removed log is one the node has already retracted. Skipping it
		// here is not the reorg handling — the tailer's fork check is — but
		// ingesting a log the node has explicitly disowned would be actively
		// wrong.
		if l.Removed || len(l.Topics) == 0 {
			continue
		}
		ev, ok := s.topics[l.Topics[0]]
		if !ok {
			continue // an event from a newer implementation than our ABI
		}

		payload, err := s.decode(ev, l)
		if err != nil {
			// One undecodable log must not stop a batch that contains a mint.
			payload = map[string]any{"decode_error": err.Error()}
		}

		out = append(out, store.Event{
			ID:            fmt.Sprintf("eth:%s:%d", l.TxHash.Hex(), l.Index),
			Chain:         s.Chain(),
			EventType:     ev.Name,
			Contract:      l.Address.Hex(),
			BlockHeight:   l.BlockNumber,
			BlockHash:     l.BlockHash.Hex(),
			TxHash:        l.TxHash.Hex(),
			LogIndex:      int(l.Index),
			CorrelationID: correlationOf(payload),
			Payload:       payload,
		})
	}
	return out, nil
}

// decode turns a log into a JSON-safe map.
//
// Indexed parameters live in topics, not in the data blob, so they are
// unpacked separately — abi.ParseTopicsIntoMap is the half of decoding that
// UnpackIntoMap does not do, and forgetting it is how an indexer ends up with
// every BridgeMinted missing the address it minted to.
func (s *Source) decode(ev abi.Event, l types.Log) (map[string]any, error) {
	decoded := map[string]any{}
	if len(l.Data) > 0 {
		if err := s.abi.UnpackIntoMap(decoded, ev.Name, l.Data); err != nil {
			return nil, err
		}
	}

	var indexed abi.Arguments
	for _, arg := range ev.Inputs {
		if arg.Indexed {
			indexed = append(indexed, arg)
		}
	}
	if len(indexed) > 0 && len(l.Topics) > 1 {
		topicMap := map[string]any{}
		if err := abi.ParseTopicsIntoMap(topicMap, indexed, l.Topics[1:]); err != nil {
			return nil, err
		}
		for k, v := range topicMap {
			decoded[k] = v
		}
	}

	return jsonSafe(decoded), nil
}

// jsonSafe renders Go's ABI types as things a jsonb column and a JavaScript
// consumer can both hold. *big.Int becomes a decimal *string*, never a JSON
// number: a USD-X amount is in 1e-6 units and loses precision above 2^53,
// which is the same reason every amount in this platform crosses a boundary
// as a string.
func jsonSafe(in map[string]any) map[string]any {
	out := make(map[string]any, len(in))
	for k, v := range in {
		switch t := v.(type) {
		case *big.Int:
			out[k] = t.String()
		case common.Address:
			out[k] = t.Hex()
		case common.Hash:
			out[k] = t.Hex()
		case [32]byte:
			out[k] = common.BytesToHash(t[:]).Hex()
		case []byte:
			out[k] = common.Bytes2Hex(t)
		default:
			out[k] = v
		}
	}
	return out
}

// correlationOf pulls the bridge saga's id out of a decoded event when it
// carries one. USDX's bridgeMint/bridgeBurn take it as a bytes32 — the keccak
// of the saga's correlation id, see bridge.CorrelationIDHash — so what lands
// here is the hash, not the uuid. Storing the hash is still what makes the
// event findable: the saga knows its own id and can hash it, and a consumer
// that only has the event can at least group its legs.
func correlationOf(payload map[string]any) string {
	for _, key := range []string{"correlationId", "correlationID", "correlation_id"} {
		if v, ok := payload[key].(string); ok && v != "" {
			return v
		}
	}
	return ""
}

// TotalSupply reads the ERC-20 total supply at the latest block. It is a
// plain eth_call rather than a sum over indexed Transfer events on purpose:
// the contract's own number is the ground truth Leg A is defined against, and
// a supply derived from events would be checking the indexer against itself.
func (s *Source) TotalSupply(ctx context.Context) (*big.Int, uint64, error) {
	head, err := s.ec.BlockNumber(ctx)
	if err != nil {
		return nil, 0, err
	}
	data, err := s.abi.Pack("totalSupply")
	if err != nil {
		return nil, 0, err
	}
	raw, err := s.ec.CallContract(ctx, ethereum.CallMsg{To: &s.contract, Data: data}, new(big.Int).SetUint64(head))
	if err != nil {
		return nil, 0, fmt.Errorf("calling totalSupply: %w", err)
	}
	values, err := s.abi.Unpack("totalSupply", raw)
	if err != nil || len(values) == 0 {
		return nil, 0, fmt.Errorf("decoding totalSupply: %w", err)
	}
	supply, ok := values[0].(*big.Int)
	if !ok {
		return nil, 0, fmt.Errorf("totalSupply returned %T, not a number", values[0])
	}
	return supply, head, nil
}
