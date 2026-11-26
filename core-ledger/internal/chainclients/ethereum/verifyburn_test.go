package ethereum

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/ethclient"
	"github.com/ethereum/go-ethereum/rpc"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum/gen"
)

// bridgeBurnedTopic is the keccak256 of "BridgeBurned(address,uint256,bytes32)"
// — the topic0 the generated binding's ParseBridgeBurned matches on (see
// gen/usdx.go's FilterBridgeBurned comment).
const bridgeBurnedTopic = "0x2d1a035d517155025d8c8d91fcd1fbc14a6a2325ec021f4037c8baa234bd34d1"

var (
	proxyAddr = common.HexToAddress("0xba07d67285721d6ad906c631dc945b5dab6a7e5c")
	otherAddr = common.HexToAddress("0x00000000000000000000000000000000000000ff")

	burnFrom     = common.HexToAddress("0x1111111111111111111111111111111111111111")
	burnAmount   = big.NewInt(10_000000) // 10.000000 USD-X
	burnCorr     = "corr-1"
	burnCorrHash = bridge.CorrelationIDHash(burnCorr)
)

// fakeEthSigner satisfies Signer; VerifyBurn never signs.
type fakeEthSigner struct{}

func (fakeEthSigner) Address() common.Address { return burnFrom }
func (fakeEthSigner) SignTx(tx *types.Transaction, chainID *big.Int) (*types.Transaction, error) {
	return tx, nil
}

// rpcFixture is one canned answer per RPC method, served over httptest.
type rpcFixture struct {
	receipt   any // receipt JSON (map), or nil for "not found"
	tx        any // transaction JSON, or nil for "not found"
	latest    string
	finalized string
}

func (f rpcFixture) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string            `json:"method"`
			Params []json.RawMessage `json:"params"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("rpc request: %v", err)
		}

		var result any
		switch req.Method {
		case "eth_getTransactionReceipt":
			result = f.receipt
		case "eth_getTransactionByHash":
			result = f.tx
		case "eth_blockNumber":
			result = f.latest
		case "eth_getBlockByNumber":
			result = map[string]any{
				"number":           f.finalized,
				"hash":             "0x" + strings.Repeat("1", 64),
				"parentHash":       "0x" + strings.Repeat("0", 64),
				"sha3Uncles":       "0x" + strings.Repeat("0", 64),
				"stateRoot":        "0x" + strings.Repeat("0", 64),
				"transactionsRoot": "0x" + strings.Repeat("0", 64),
				"receiptsRoot":     "0x" + strings.Repeat("0", 64),
				"logsBloom":        "0x" + strings.Repeat("0", 512),
				"difficulty":       "0x0",
				"gasLimit":         "0x1c9c380",
				"gasUsed":          "0x0",
				"timestamp":        "0x0",
				"extraData":        "0x",
				"mixHash":          "0x" + strings.Repeat("0", 64),
				"nonce":            "0x0000000000000000",
			}
		default:
			t.Fatalf("unexpected rpc method %s", req.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	})
}

func hexQuantity(n int64) string {
	return "0x" + big.NewInt(n).Text(16)
}

// burnLog builds the BridgeBurned log entry: topic1 is the indexed `from`,
// the data is amount (32 bytes) followed by the correlation id (32 bytes).
func burnLog(from common.Address, amount *big.Int, corrHash [32]byte) map[string]any {
	data := make([]byte, 64)
	amount.FillBytes(data[:32])
	copy(data[32:], corrHash[:])

	return map[string]any{
		"address":          proxyAddr.Hex(),
		"topics":           []string{bridgeBurnedTopic, common.BytesToHash(from.Bytes()).Hex()},
		"data":             "0x" + common.Bytes2Hex(data),
		"blockNumber":      hexQuantity(100),
		"transactionHash":  "0x" + strings.Repeat("a", 64),
		"transactionIndex": "0x0",
		"blockHash":        "0x" + strings.Repeat("b", 64),
		"logIndex":         "0x0",
		"removed":          false,
	}
}

// burnReceipt is a mined, successful receipt whose logs are exactly `logs`.
func burnReceipt(to common.Address, status string, logs ...map[string]any) map[string]any {
	if logs == nil {
		logs = []map[string]any{}
	}
	return map[string]any{
		"blockHash":         "0x" + strings.Repeat("b", 64),
		"blockNumber":       hexQuantity(100),
		"contractAddress":   nil,
		"cumulativeGasUsed": "0x5208",
		"effectiveGasPrice": "0x1",
		"from":              burnFrom.Hex(),
		"gasUsed":           "0x5208",
		"logs":              logs,
		"logsBloom":         "0x" + strings.Repeat("0", 512),
		"status":            status,
		"to":                to.Hex(),
		"transactionHash":   "0x" + strings.Repeat("a", 64),
		"transactionIndex":  "0x0",
		"type":              "0x2",
	}
}

// burnTx is the transaction TransactionByHash answers with.
func burnTx(to common.Address) map[string]any {
	return map[string]any{
		"type": "0x2", "chainId": "0x1", "nonce": "0x0", "to": to.Hex(),
		"gas": "0x5208", "gasPrice": nil, "maxPriorityFeePerGas": "0x1", "maxFeePerGas": "0x2",
		"value": "0x0", "input": "0x", "hash": "0x" + strings.Repeat("a", 64),
		"from": burnFrom.Hex(), "blockHash": "0x" + strings.Repeat("b", 64),
		"blockNumber": hexQuantity(100), "transactionIndex": "0x0",
		"v": "0x0", "r": "0x0", "s": "0x0",
	}
}

func newTestClient(t *testing.T, fx rpcFixture, level string) *Client {
	t.Helper()
	server := httptest.NewServer(fx.handler(t))
	t.Cleanup(server.Close)

	rpcClient, err := rpc.DialContext(context.Background(), server.URL)
	if err != nil {
		t.Fatalf("dialing rpc: %v", err)
	}
	ec := ethclient.NewClient(rpcClient)
	contract, err := gen.NewUSDX(proxyAddr, ec)
	if err != nil {
		t.Fatalf("binding contract: %v", err)
	}
	if level == "" {
		level = "12"
	}
	return &Client{
		ec:            ec,
		contract:      contract,
		chainID:       big.NewInt(1),
		signer:        fakeEthSigner{},
		proxy:         proxyAddr,
		finalityLevel: level,
	}
}

func goodFixture() rpcFixture {
	return rpcFixture{
		// The block at height 100 with 12 confirmations: latest = 111.
		receipt:   burnReceipt(proxyAddr, "0x1", burnLog(burnFrom, burnAmount, burnCorrHash)),
		tx:        burnTx(proxyAddr),
		latest:    hexQuantity(111),
		finalized: hexQuantity(100),
	}
}

func TestVerifyBurn(t *testing.T) {
	t.Run("a matching, final burn verifies", func(t *testing.T) {
		c := newTestClient(t, goodFixture(), "12")
		if err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr); err != nil {
			t.Fatalf("VerifyBurn: %v", err)
		}
	})

	t.Run("the finalized checkpoint also counts", func(t *testing.T) {
		fx := goodFixture()
		c := newTestClient(t, fx, "finalized")
		if err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr); err != nil {
			t.Fatalf("VerifyBurn: %v", err)
		}
	})

	t.Run("wrong amount", func(t *testing.T) {
		c := newTestClient(t, goodFixture(), "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), big.NewInt(1), burnCorr)
		assertMismatch(t, err, "amount")
	})

	t.Run("wrong from", func(t *testing.T) {
		fx := goodFixture()
		fx.receipt = burnReceipt(proxyAddr, "0x1", burnLog(otherAddr, burnAmount, burnCorrHash))
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		assertMismatch(t, err, "from")
	})

	t.Run("wrong correlation id", func(t *testing.T) {
		fx := goodFixture()
		otherCorr := bridge.CorrelationIDHash("something-else")
		fx.receipt = burnReceipt(proxyAddr, "0x1", burnLog(burnFrom, burnAmount, otherCorr))
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		assertMismatch(t, err, "correlation_id")
	})

	t.Run("a reverted burn", func(t *testing.T) {
		fx := goodFixture()
		fx.receipt = burnReceipt(proxyAddr, "0x0", burnLog(burnFrom, burnAmount, burnCorrHash))
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		if !errors.Is(err, bridge.ErrBurnReverted) {
			t.Fatalf("err = %v, want ErrBurnReverted", err)
		}
	})

	t.Run("a burn short of the confirmation depth", func(t *testing.T) {
		fx := goodFixture()
		fx.latest = hexQuantity(100) // 1 confirmation, 12 wanted
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		if !errors.Is(err, bridge.ErrBurnNotFinal) {
			t.Fatalf("err = %v, want ErrBurnNotFinal", err)
		}
	})

	t.Run("a burn short of the finalized checkpoint", func(t *testing.T) {
		fx := goodFixture()
		fx.finalized = hexQuantity(99)
		c := newTestClient(t, fx, "finalized")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		if !errors.Is(err, bridge.ErrBurnNotFinal) {
			t.Fatalf("err = %v, want ErrBurnNotFinal", err)
		}
	})

	t.Run("a transaction the chain has never seen", func(t *testing.T) {
		fx := goodFixture()
		fx.receipt = nil
		fx.tx = nil
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		if !errors.Is(err, bridge.ErrBurnNotFound) {
			t.Fatalf("err = %v, want ErrBurnNotFound", err)
		}
	})

	t.Run("a transaction for another contract", func(t *testing.T) {
		fx := goodFixture()
		fx.receipt = burnReceipt(otherAddr, "0x1", burnLog(burnFrom, burnAmount, burnCorrHash))
		fx.tx = burnTx(otherAddr)
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		assertMismatch(t, err, "contract")
	})

	t.Run("a successful receipt with no burn event", func(t *testing.T) {
		fx := goodFixture()
		fx.receipt = burnReceipt(proxyAddr, "0x1")
		c := newTestClient(t, fx, "12")
		err := c.VerifyBurn(context.Background(), "0x"+strings.Repeat("a", 64), burnFrom.Hex(), burnAmount, burnCorr)
		if !errors.Is(err, bridge.ErrBurnNotFound) {
			t.Fatalf("err = %v, want ErrBurnNotFound", err)
		}
	})
}

func assertMismatch(t *testing.T, err error, wantField string) {
	t.Helper()
	var mismatch *bridge.ErrBurnMismatch
	if !errors.As(err, &mismatch) {
		t.Fatalf("err = %v, want ErrBurnMismatch{%q}", err, wantField)
	}
	if mismatch.Field != wantField {
		t.Fatalf("mismatch field = %q, want %q", mismatch.Field, wantField)
	}
}

func TestValidTxHash(t *testing.T) {
	c := &Client{}
	cases := map[string]bool{
		"0x" + strings.Repeat("a", 64):       true,
		"0X" + strings.Repeat("A", 64):       true,
		"0x1234":                             false,
		"0x" + strings.Repeat("g", 64):       false,
		strings.Repeat("a", 66):              false,
		"":                                   false,
		"0x" + strings.Repeat("a", 63) + "z": false,
	}
	for hash, want := range cases {
		if got := c.ValidTxHash(hash); got != want {
			t.Errorf("ValidTxHash(%q) = %v, want %v", hash, got, want)
		}
	}
}
