package ethereum

import (
	"bytes"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/ethereum/gen"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// H6: the four role-gated methods must build exactly the transaction the
// contract expects — right method name for the signer's policy, right
// selector, right argument — and carry the compliance action id as the
// correlation id a retry re-signs under.

// rpcStub is a JSON-RPC server standing in for the chain: it answers the
// handful of calls the abigen transact path makes and captures every raw
// transaction it is asked to broadcast.
type rpcStub struct {
	mu  sync.Mutex
	txs []string // hex of the raw transactions sent

	proxy common.Address
	chain uint64

	// finality scripting: receipt is the JSON-RPC result for
	// eth_getTransactionReceipt (empty -> "not found"), finalizedNumber is the
	// hex block number eth_getBlockByNumber answers for the "finalized" tag
	// (defaults to 0x0).
	receipt         string
	finalizedNumber string
}

func (s *rpcStub) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Method string            `json:"method"`
		Params []json.RawMessage `json:"params"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	write := func(result string) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":` + result + `}`))
	}

	switch req.Method {
	case "eth_chainId":
		write(`"0x` + big.NewInt(int64(s.chain)).Text(16) + `"`)
	case "eth_estimateGas":
		write(`"0x7530"`)
	case "eth_gasPrice":
		write(`"0x3b9aca00"`)
	case "eth_getTransactionCount":
		write(`"0x0"`)
	case "eth_getTransactionReceipt":
		if s.receipt == "" {
			// A null result is what ethclient maps to ethereum.NotFound.
			write(`null`)
			return
		}
		write(s.receipt)
	case "eth_getBlockByNumber":
		// A pre-1559 block (no baseFeePerGas): the transact path stays on the
		// legacy fee scheme, which needs nothing but eth_gasPrice. For the
		// "finalized" tag the number is scripted per test.
		number := "0x0"
		if len(req.Params) > 0 {
			var tag string
			_ = json.Unmarshal(req.Params[0], &tag)
			if tag == "finalized" && s.finalizedNumber != "" {
				number = s.finalizedNumber
			}
		}
		write(`{"parentHash":"0x` + strings.Repeat("0", 64) + `","sha3Uncles":"0x` + strings.Repeat("0", 64) +
			`","miner":"0x` + strings.Repeat("0", 40) + `","stateRoot":"0x` + strings.Repeat("0", 64) +
			`","transactionsRoot":"0x` + strings.Repeat("0", 64) + `","receiptsRoot":"0x` + strings.Repeat("0", 64) +
			`","logsBloom":"0x` + strings.Repeat("0", 512) + `","difficulty":"0x0","number":"` + number + `","gasLimit":"0x1c9c380",` +
			`"gasUsed":"0x0","timestamp":"0x0","extraData":"0x","mixHash":"0x` + strings.Repeat("0", 64) +
			`","nonce":"0x0000000000000000","hash":"0x` + strings.Repeat("0", 64) + `"}`)
	case "eth_getCode":
		// The proxy has code (the estimate succeeds); the value is not read.
		write(`"0x6000"`)
	case "eth_sendRawTransaction":
		var raw string
		if len(req.Params) > 0 {
			_ = json.Unmarshal(req.Params[0], &raw)
		}
		s.txs = append(s.txs, raw)
		write(`"0x` + strings.Repeat("ab", 32) + `"`)
	default:
		// The method name rides in the body so a test failure names what the
		// transact path asked for and this stub does not know.
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte(req.Method))
	}
}

// recordingSigner signs with a test key and records the signing context each
// call was made under — the method name a remote signer's policy would match
// on, and the correlation id (the compliance reference) it would bind to.
type recordingSigner struct {
	mu  sync.Mutex
	key *ecdsa.PrivateKey

	contexts []string // "method|correlationID|amount|to"
}

func newRecordingSigner(t *testing.T) *recordingSigner {
	t.Helper()
	seed := make([]byte, 32)
	for i := range seed {
		seed[i] = byte(9 + i)
	}
	key, err := crypto.ToECDSA(seed)
	if err != nil {
		t.Fatalf("deriving test key: %v", err)
	}
	return &recordingSigner{key: key}
}

func (s *recordingSigner) Address() common.Address {
	return crypto.PubkeyToAddress(s.key.PublicKey)
}

func (s *recordingSigner) SignTx(tx *types.Transaction, chainID *big.Int) (*types.Transaction, error) {
	return types.SignTx(tx, types.LatestSignerForChainID(chainID), s.key)
}

// WithSigningContext implements ContextualSigner: each call records what the
// client said it is authorising, which is exactly what a remote signer would
// evaluate policy on.
func (s *recordingSigner) WithSigningContext(method, correlationID string, amount *big.Int, to string) Signer {
	s.mu.Lock()
	defer s.mu.Unlock()
	amt := "<nil>"
	if amount != nil {
		amt = amount.String()
	}
	s.contexts = append(s.contexts, strings.Join([]string{method, correlationID, amt, to}, "|"))
	return s
}

func (s *recordingSigner) lastContext() string {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.contexts[len(s.contexts)-1]
}

// newEnforcementClient dials the stub RPC and binds a real client to it, with
// the recording signer behind the Signer seam.
func newEnforcementClient(t *testing.T, stub *rpcStub) (*Client, *recordingSigner) {
	t.Helper()
	signer := newRecordingSigner(t)
	client, err := NewClientWithSigner(stubServerURL(t, stub), stub.proxy.Hex(), signer)
	if err != nil {
		t.Fatalf("NewClientWithSigner: %v", err)
	}
	return client, signer
}

func stubServerURL(t *testing.T, stub *rpcStub) string {
	t.Helper()
	srv := httptest.NewServer(stub)
	t.Cleanup(srv.Close)
	return srv.URL
}

// decodeRawTx unpacks a broadcast raw transaction: the contract it calls and
// the decoded method arguments.
func decodeRawTx(t *testing.T, rawHex, wantMethod string) (common.Address, abi.Arguments, []any) {
	t.Helper()
	raw, err := hex.DecodeString(strings.TrimPrefix(rawHex, "0x"))
	if err != nil {
		t.Fatalf("decoding raw tx: %v", err)
	}
	var tx types.Transaction
	if err := tx.UnmarshalBinary(raw); err != nil {
		t.Fatalf("unmarshalling raw tx: %v", err)
	}
	if tx.To() == nil {
		t.Fatalf("the enforcement transaction calls no contract")
	}

	parsedABI, err := gen.USDXMetaData.GetAbi()
	if err != nil {
		t.Fatalf("parsing USDX ABI: %v", err)
	}
	method, ok := parsedABI.Methods[wantMethod]
	if !ok {
		t.Fatalf("no method %s in the ABI", wantMethod)
	}
	data := tx.Data()
	if len(data) < 4 || !bytes.Equal(data[:4], method.ID) {
		t.Fatalf("calldata %x does not start with the %s selector %x", data, wantMethod, method.ID)
	}
	args, err := method.Inputs.Unpack(data[4:])
	if err != nil {
		t.Fatalf("unpacking %s arguments: %v", wantMethod, err)
	}
	return *tx.To(), method.Inputs, args
}

func TestEnforcementBuildsTheFourTransactions(t *testing.T) {
	target := common.HexToAddress("0x00000000000000000000000000000000000000E1")

	cases := []struct {
		call       func(*Client, string) (string, error)
		address    string // "" for pause/unpause
		method     string // the abi method the calldata must be
		signerName string // the signing-context method a remote signer's policy matches
		ref        string
	}{
		{
			call:       func(c *Client, ref string) (string, error) { return c.Blacklist(target.Hex(), ref) },
			address:    target.Hex(),
			method:     "blacklist",
			signerName: "blacklist",
			ref:        "enf_blacklist_1",
		},
		{
			call:       func(c *Client, ref string) (string, error) { return c.Unblacklist(target.Hex(), ref) },
			address:    target.Hex(),
			method:     "unblacklist",
			signerName: "unblacklist",
			ref:        "enf_unblacklist_1",
		},
		{
			call:       func(c *Client, ref string) (string, error) { return c.Pause(ref) },
			method:     "pause",
			signerName: "pause",
			ref:        "enf_pause_1",
		},
		{
			call:       func(c *Client, ref string) (string, error) { return c.Unpause(ref) },
			method:     "unpause",
			signerName: "unpause",
			ref:        "enf_unpause_1",
		},
	}

	for _, tc := range cases {
		t.Run(tc.method, func(t *testing.T) {
			stub := &rpcStub{proxy: common.HexToAddress("0x00000000000000000000000000000000000000D0"), chain: 11155111}
			client, signer := newEnforcementClient(t, stub)

			txHash, err := tc.call(client, tc.ref)
			if err != nil {
				t.Fatalf("%s: %v", tc.method, err)
			}
			if txHash == "" {
				t.Fatalf("%s returned no tx hash", tc.method)
			}

			// Exactly one transaction was broadcast, for the bound proxy.
			stub.mu.Lock()
			sent := append([]string(nil), stub.txs...)
			stub.mu.Unlock()
			if len(sent) != 1 {
				t.Fatalf("%s broadcast %d transactions, want 1", tc.method, len(sent))
			}

			to, inputs, args := decodeRawTx(t, sent[0], tc.method)
			if to != stub.proxy {
				t.Fatalf("tx calls %s, want the bound proxy %s", to, stub.proxy)
			}
			if tc.address != "" {
				got, ok := args[0].(common.Address)
				if !ok || got != common.HexToAddress(tc.address) {
					t.Fatalf("%s args = %v (want the address in %s position)", tc.method, args, inputs[0].Name)
				}
			}

			// The signing context carries the policy method and the compliance
			// reference as the correlation id — the two things a remote signer
			// evaluates before signing.
			want := tc.signerName + "|" + tc.ref + "|<nil>|" + tc.address
			if got := signer.lastContext(); got != want {
				t.Fatalf("signing context = %q, want %q", got, want)
			}
		})
	}
}

// FinalityStatus is the sweep's one-call check: it must answer immediately,
// never poll, and distinguish "not final" (false, nil) from "landed and
// failed" (ErrTxFailedOnChain) from "chain not reachable" (other errors).

func receiptJSON(status, block string) string {
	return `{"status":"` + status + `","blockNumber":"` + block + `","transactionHash":"0x` + strings.Repeat("ab", 32) +
		`","cumulativeGasUsed":"0x5208","gasUsed":"0x5208","logsBloom":"0x` + strings.Repeat("0", 512) + `","logs":[]}` +
		`}`
}

func TestFinalityStatusAnswersImmediately(t *testing.T) {
	target := common.HexToAddress("0x00000000000000000000000000000000000000E1")

	cases := []struct {
		name            string
		receipt         string
		finalizedNumber string
		wantFinal       bool
		wantFailed      bool // ErrTxFailedOnChain
	}{
		{"not mined yet", "", "0x5", false, false},
		{"mined and reverted", receiptJSON("0x0", "0x2"), "0x5", false, true},
		{"mined, final", receiptJSON("0x1", "0x2"), "0x5", true, false},
		{"mined, not deep enough", receiptJSON("0x1", "0x9"), "0x5", false, false},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			stub := &rpcStub{
				proxy:           target,
				chain:           11155111,
				receipt:         tc.receipt,
				finalizedNumber: tc.finalizedNumber,
			}
			client, _ := newEnforcementClient(t, stub)

			final, err := client.FinalityStatus("0x" + strings.Repeat("ab", 32))
			if tc.wantFailed {
				if !errors.Is(err, bridge.ErrTxFailedOnChain) {
					t.Fatalf("err = %v, want ErrTxFailedOnChain", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("FinalityStatus: %v", err)
			}
			if final != tc.wantFinal {
				t.Fatalf("final = %v, want %v", final, tc.wantFinal)
			}
		})
	}
}
