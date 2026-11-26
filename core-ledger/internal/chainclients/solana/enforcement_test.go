package solana

import (
	"bytes"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/rpc"
)

// H6: the set_paused instruction must match what the Anchor program's
// AdminOnly struct expects — config account first, the signer second, the
// Borsh bool after the global discriminator — or the cluster rejects it as
// InvalidAccountOwner/InvalidAdmin rather than as a bug in our builder.

func newEnforcementClient(t *testing.T) (*Client, solanago.PublicKey) {
	t.Helper()
	key := fixedKey(t, 3)
	// Derived from fixed keys rather than written as literals: a base58
	// literal that is off by one character is an easy, silent way to test the
	// wrong program.
	programID := fixedKey(t, 40).PublicKey()
	mint := fixedKey(t, 41).PublicKey()

	// NewClientWithSigner dials nothing until the first RPC call, so the empty
	// URL is fine for a test that only builds an instruction.
	client, err := NewClientWithSigner("", programID.String(), mint.String(), &localSigner{key: key})
	if err != nil {
		t.Fatalf("NewClientWithSigner: %v", err)
	}
	return client, key.PublicKey()
}

func TestSetPausedInstructionLayout(t *testing.T) {
	client, signer := newEnforcementClient(t)
	configPDA, _, err := solanago.FindProgramAddress([][]byte{[]byte(configSeed)}, client.programID)
	if err != nil {
		t.Fatalf("deriving config PDA: %v", err)
	}

	for _, tc := range []struct {
		name   string
		paused bool
		flag   byte
	}{
		{"pause", true, 1},
		{"unpause", false, 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			ix := client.setPausedInstruction(configPDA, tc.paused)

			if !ix.ProgramID().Equals(client.programID) {
				t.Fatalf("program = %s, want %s", ix.ProgramID(), client.programID)
			}

			// AdminOnly's account order: config (writable), admin (signer).
			accounts := ix.Accounts()
			if len(accounts) != 2 {
				t.Fatalf("accounts = %d, want 2 (config, admin)", len(accounts))
			}
			if !accounts[0].PublicKey.Equals(configPDA) || !accounts[0].IsWritable {
				t.Fatalf("account 0 = %s (writable=%v), want the writable config PDA", accounts[0].PublicKey, accounts[0].IsWritable)
			}
			if !accounts[1].PublicKey.Equals(signer) || !accounts[1].IsSigner {
				t.Fatalf("account 1 = %s (signer=%v), want the signing admin", accounts[1].PublicKey, accounts[1].IsSigner)
			}

			// Global discriminator + one Borsh bool, exactly like lib.rs's
			// set_paused(ctx, paused: bool).
			want := append(anchorDiscriminator("set_paused"), tc.flag)
			data, err := ix.Data()
			if err != nil {
				t.Fatalf("reading instruction data: %v", err)
			}
			if !bytes.Equal(data, want) {
				t.Fatalf("data = %x, want %x", data, want)
			}
		})
	}
}

// FinalityStatus is the sweep's one-call check: immediate, never polling, and
// it must tell "not seen" (false, nil) from "landed and failed"
// (ErrTxFailedOnChain) from "not there yet" (confirmed but not finalized).

func TestFinalityStatusAnswersImmediately(t *testing.T) {
	cases := []struct {
		name       string
		value      string // the JSON-RPC result's value element
		wantFinal  bool
		wantFailed bool
	}{
		{"not seen", "null", false, false},
		{"confirmed, not finalized", `{"slot":1,"confirmations":10,"err":null,"confirmationStatus":"confirmed"}`, false, false},
		{"finalized", `{"slot":1,"confirmations":64,"err":null,"confirmationStatus":"finalized"}`, true, false},
		{"landed and failed", `{"slot":1,"confirmations":1,"err":{"InstructionError":[0,{"Custom":6001}]},"confirmationStatus":"finalized"}`, false, true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				var req struct {
					Method string `json:"method"`
				}
				if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
					w.WriteHeader(http.StatusBadRequest)
					return
				}
				if req.Method != "getSignatureStatuses" {
					t.Errorf("unexpected RPC method %s", req.Method)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(`{"jsonrpc":"2.0","id":1,"result":{"context":{"slot":1},"value":[` + tc.value + `]}}`))
			}))
			defer srv.Close()

			client, _ := newEnforcementClient(t)
			client.rpc = rpc.New(srv.URL)

			sig := solanago.Signature{1}
			final, err := client.FinalityStatus(sig.String())
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
