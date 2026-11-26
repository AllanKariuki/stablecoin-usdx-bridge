package solana

import (
	"context"
	"encoding/json"
	"errors"
	"math/big"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
)

// solFixture is one canned answer per RPC method, served over httptest. The
// transaction JSON is the RPC's `json`-encoding shape — what the client gets
// back when no encoding is requested — decoded by solana-go into the
// TransactionResultEnvelope's parsed transaction.
type solFixture struct {
	tx       any // the getTransaction result, or nil for "not found"
	statuses []map[string]any
}

func (f solFixture) handler(t *testing.T) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Method string `json:"method"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			t.Fatalf("rpc request: %v", err)
		}
		var result any
		switch req.Method {
		case "getTransaction":
			result = f.tx
		case "getSignatureStatuses":
			result = map[string]any{
				"context": map[string]any{"slot": 1},
				"value":   f.statuses,
			}
		default:
			t.Fatalf("unexpected rpc method %s", req.Method)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{"jsonrpc": "2.0", "id": 1, "result": result})
	})
}

// b58 encodes raw bytes the way solana.Base58 marshals (base58 in a JSON
// string).
func b58(raw []byte) string {
	enc, err := json.Marshal(solanago.Base58(raw))
	if err != nil {
		panic(err)
	}
	return strings.Trim(string(enc), `"`)
}

// burnTxSpec carries the values a bridge_burn instruction is built with, and
// where the program id sits in accountKeys (so the wrong-program case can
// point the instruction at a decoy).
type burnTxSpec struct {
	amount        *big.Int
	correlationID string
	sourceATA     solanago.PublicKey
	programIndex  int
	accounts      []uint16
}

func burnTxJSON(programID solanago.PublicKey, accounts []solanago.PublicKey, spec burnTxSpec) map[string]any {
	data := encodeBridgeArgs(anchorDiscriminator("bridge_burn"), spec.amount, spec.correlationID)

	// The instruction's account index 2 names the source token account; the
	// spec's sourceATA is what that slot holds in this fixture (the real one,
	// or a stranger's, for the wrong-from case).
	keys := make([]string, len(accounts))
	for i, k := range accounts {
		keys[i] = k.String()
	}
	keys[2] = spec.sourceATA.String()

	return map[string]any{
		"slot":      123,
		"blockTime": 1700000000,
		"meta": map[string]any{
			"err":         nil,
			"fee":         5000,
			"logMessages": []string{},
		},
		"transaction": map[string]any{
			"signatures": []string{strings.Repeat("1", 64)},
			"message": map[string]any{
				"header": map[string]any{
					"numRequiredSignatures":       1,
					"numReadonlySignedAccounts":   0,
					"numReadonlyUnsignedAccounts": 5,
				},
				"accountKeys":     keys,
				"recentBlockhash": b58(make([]byte, 32)),
				"instructions": []map[string]any{{
					"programIdIndex": spec.programIndex,
					"accounts":       spec.accounts,
					"data":           b58(data),
				}},
			},
		},
		"version": nil,
	}
}

func newSolTestClient(t *testing.T, programID, mint solanago.PublicKey, fx solFixture) *Client {
	t.Helper()
	server := httptest.NewServer(fx.handler(t))
	t.Cleanup(server.Close)
	return &Client{rpc: rpc.New(server.URL), programID: programID, mint: mint}
}

// accountRow is BridgeBurn's account order (mint, mint_authority, source,
// processed_marker, config, relayer, token_program, system_program) with the
// program id inserted at programIndex. The source ATA sits at account index
// 2, exactly where the instruction's accounts slice points.
func accountRow(t *testing.T, programID, mint, sourceATA solanago.PublicKey, programIndex int) []solanago.PublicKey {
	t.Helper()
	row := []solanago.PublicKey{
		mint,
		pk(t, 120), // mint_authority PDA (not checked by VerifyBurn)
		sourceATA,  // source token account
		pk(t, 130), // processed marker
		pk(t, 140), // config
		pk(t, 150), // relayer
		solanago.TokenProgramID,
		solanago.SystemProgramID,
	}
	if programIndex > len(row) {
		t.Fatalf("programIndex %d out of range", programIndex)
	}
	return append(row[:programIndex], append([]solanago.PublicKey{programID}, row[programIndex:]...)...)
}

func TestVerifyBurnSolana(t *testing.T) {
	programID := pk(t, 1)
	mint := pk(t, 2)
	from := pk(t, 40)
	sourceATA, _, err := solanago.FindAssociatedTokenAddress(from, mint)
	if err != nil {
		t.Fatalf("deriving source ATA: %v", err)
	}

	amount := big.NewInt(10_000000)
	correlationID := "corr-sol-1"
	// The base58 encoding of a 64-byte signature — computed, not typed, so it
	// is valid by construction.
	txHash := b58(make([]byte, 64))

	good := func(t *testing.T) solFixture {
		keys := accountRow(t, programID, mint, sourceATA, 4)
		return solFixture{tx: burnTxJSON(programID, keys, burnTxSpec{
			amount:        amount,
			correlationID: correlationID,
			sourceATA:     sourceATA,
			programIndex:  4,
			accounts:      []uint16{0, 1, 2, 3, 4, 5, 6, 7, 8},
		})}
	}

	t.Run("a matching, final burn verifies", func(t *testing.T) {
		c := newSolTestClient(t, programID, mint, good(t))
		if err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID); err != nil {
			t.Fatalf("VerifyBurn: %v", err)
		}
	})

	t.Run("wrong amount", func(t *testing.T) {
		fx := good(t)
		keys := accountRow(t, programID, mint, sourceATA, 4)
		fx.tx = burnTxJSON(programID, keys, burnTxSpec{
			amount: big.NewInt(1), correlationID: correlationID, sourceATA: sourceATA,
			programIndex: 4, accounts: []uint16{0, 1, 2, 3, 4, 5, 6, 7, 8},
		})
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		assertSolMismatch(t, err, "amount")
	})

	t.Run("wrong from", func(t *testing.T) {
		fx := good(t)
		keys := accountRow(t, programID, mint, sourceATA, 4)
		fx.tx = burnTxJSON(programID, keys, burnTxSpec{
			amount: amount, correlationID: correlationID, sourceATA: pk(t, 200),
			programIndex: 4, accounts: []uint16{0, 1, 2, 3, 4, 5, 6, 7, 8},
		})
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		assertSolMismatch(t, err, "from")
	})

	t.Run("wrong correlation id", func(t *testing.T) {
		fx := good(t)
		keys := accountRow(t, programID, mint, sourceATA, 4)
		fx.tx = burnTxJSON(programID, keys, burnTxSpec{
			amount: amount, correlationID: "some-other-saga", sourceATA: sourceATA,
			programIndex: 4, accounts: []uint16{0, 1, 2, 3, 4, 5, 6, 7, 8},
		})
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		assertSolMismatch(t, err, "correlation_id")
	})

	t.Run("a reverted transaction", func(t *testing.T) {
		fx := good(t)
		tx := fx.tx.(map[string]any)
		tx["meta"] = map[string]any{"err": map[string]any{"InstructionError": []any{2, map[string]any{"Custom": 6003}}}}
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		if !errors.Is(err, bridge.ErrBurnReverted) {
			t.Fatalf("err = %v, want ErrBurnReverted", err)
		}
	})

	t.Run("included but not final", func(t *testing.T) {
		fx := good(t)
		fx.tx = nil
		fx.statuses = []map[string]any{{
			"slot": 90, "confirmations": nil, "err": nil, "confirmationStatus": "confirmed",
		}}
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		if !errors.Is(err, bridge.ErrBurnNotFinal) {
			t.Fatalf("err = %v, want ErrBurnNotFinal", err)
		}
	})

	t.Run("a transaction the cluster has never seen", func(t *testing.T) {
		fx := good(t)
		fx.tx = nil
		fx.statuses = []map[string]any{}
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		if !errors.Is(err, bridge.ErrBurnNotFound) {
			t.Fatalf("err = %v, want ErrBurnNotFound", err)
		}
	})

	t.Run("a transaction for another program", func(t *testing.T) {
		fx := good(t)
		// The program id is not among the account keys: the instruction's
		// programIdIndex points at a decoy, so no bridge_burn instruction for
		// the configured program exists.
		decoy := pk(t, 250)
		keys := accountRow(t, programID, mint, sourceATA, 4)
		for i := range keys {
			if keys[i].Equals(programID) {
				keys[i] = decoy
			}
		}
		fx.tx = burnTxJSON(programID, keys, burnTxSpec{
			amount: amount, correlationID: correlationID, sourceATA: sourceATA,
			programIndex: 4, accounts: []uint16{0, 1, 2, 3, 4, 5, 6, 7, 8},
		})
		c := newSolTestClient(t, programID, mint, fx)
		err := c.VerifyBurn(context.Background(), txHash, from.String(), amount, correlationID)
		if !errors.Is(err, bridge.ErrBurnNotFound) {
			t.Fatalf("err = %v, want ErrBurnNotFound", err)
		}
	})
}

func assertSolMismatch(t *testing.T, err error, wantField string) {
	t.Helper()
	var mismatch *bridge.ErrBurnMismatch
	if !errors.As(err, &mismatch) {
		t.Fatalf("err = %v, want ErrBurnMismatch{%q}", err, wantField)
	}
	if mismatch.Field != wantField {
		t.Fatalf("mismatch field = %q, want %q", mismatch.Field, wantField)
	}
}

func TestValidTxHashSolana(t *testing.T) {
	c := &Client{}
	if !c.ValidTxHash(b58(make([]byte, 64))) {
		t.Fatal("a 64-byte base58 signature must be valid")
	}
	for _, bad := range []string{"", "not-base58!!", "0x" + strings.Repeat("a", 64), strings.Repeat("1", 44)} {
		if c.ValidTxHash(bad) {
			t.Errorf("ValidTxHash(%q) = true, want false", bad)
		}
	}
}
