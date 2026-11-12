package api

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"io"
	"log/slog"
	"math/big"
	"net/http/httptest"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/audit"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/decode"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/keystore"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/policy"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
	solanago "github.com/gagliardetto/solana-go"
	"github.com/gofiber/fiber/v2"
)

// These drive POST /sign end to end over an in-memory audit log. The
// database properties behind the real one — the unique index, the payload
// check under SERIALIZABLE — are tested against Postgres in internal/audit;
// what is tested here is the order the handler asks its questions in, and
// what it does with each answer.

// ---- fakes ----------------------------------------------------------------

type memLog struct {
	records []audit.Record
	// appendErr, when set, is returned for the next ALLOWED append — the
	// race where another replica bound the correlation id first.
	appendErr error
}

func (m *memLog) Existing(_ context.Context, chain, method, correlationID, digest string) (*audit.Record, error) {
	if correlationID == "" {
		return nil, nil
	}
	var first *audit.Record
	for i := range m.records {
		r := &m.records[i]
		if r.Chain != chain || r.Method != method || r.CorrelationID != correlationID || r.Outcome != audit.OutcomeAllowed {
			continue
		}
		if r.Digest == digest {
			return r, nil
		}
		if first == nil {
			first = r
		}
	}
	return first, nil
}

func (m *memLog) DailyTotal(_ context.Context, chain, method, exclude string) (*big.Int, error) {
	total, seen := new(big.Int), map[string]bool{}
	for _, r := range m.records {
		if r.Chain != chain || r.Method != method || r.Outcome != audit.OutcomeAllowed || r.Amount == "" {
			continue
		}
		if r.CorrelationID != "" && (r.CorrelationID == exclude || seen[r.CorrelationID]) {
			continue
		}
		seen[r.CorrelationID] = true
		v, _ := new(big.Int).SetString(r.Amount, 10)
		total.Add(total, v)
	}
	return total, nil
}

func (m *memLog) Append(_ context.Context, r *audit.Record) error {
	if r.Outcome == audit.OutcomeAllowed && m.appendErr != nil {
		err := m.appendErr
		m.appendErr = nil
		return err
	}
	r.ID = hex.EncodeToString([]byte{byte(len(m.records))})
	m.records = append(m.records, *r)
	return nil
}

func (m *memLog) Recent(context.Context, int) ([]audit.Record, error) { return m.records, nil }
func (m *memLog) Verify(context.Context) (bool, string, int, error) {
	return true, "", len(m.records), nil
}
func (m *memLog) count(outcome string) (n int) {
	for _, r := range m.records {
		if r.Outcome == outcome {
			n++
		}
	}
	return n
}

// fakeBackend signs by hashing, so two different digests give two different
// signatures and the same digest gives the same one.
type fakeBackend struct{ signed int }

func (b *fakeBackend) Name() string { return "fake" }
func (b *fakeBackend) Keys(context.Context) ([]keystore.KeyRef, error) {
	return []keystore.KeyRef{{ID: "relayer", PublicKey: "pk", Backend: "fake"}}, nil
}
func (b *fakeBackend) Sign(_ context.Context, _ string, digest []byte) ([]byte, error) {
	b.signed++
	sum := sha256.Sum256(digest)
	return sum[:], nil
}

// ---- fixtures -------------------------------------------------------------

var (
	usdxProxy = common.HexToAddress("0x1111111111111111111111111111111111111111")
	alice     = common.HexToAddress("0x2222222222222222222222222222222222222222")

	solProgram = solanago.MustPublicKeyFromBase58("9GFGtYxGtZg8Smk4yyya7zAT6V3WcLDsB9XWWQbxMS8")
	solMint    = solanago.NewWallet().PublicKey()
	solRelayer = solanago.NewWallet().PublicKey()
	solWallet  = solanago.NewWallet().PublicKey()

	deployment = decode.Deployment{EthContract: usdxProxy, SolProgram: solProgram, SolMint: solMint}
)

const worker = "core-ledger-worker"

func testPolicy() policy.Policy {
	return policy.Policy{
		Rules: []policy.Rule{
			{Chain: "ETHEREUM", Method: policy.MethodBridgeMint, MaxAmount: big.NewInt(1000), AllowedCallers: []string{worker}},
			{Chain: "SOLANA", Method: policy.MethodBridgeMint, MaxAmount: big.NewInt(1000), AllowedCallers: []string{worker}},
		},
		// Room for one 1000 mint and not two: a re-sign that counted itself
		// twice would be refused.
		DailyLimits: map[string]*big.Int{policy.LimitKey("ETHEREUM", policy.MethodBridgeMint): big.NewInt(1500)},
	}
}

func newApp(log AuditLog, backend keystore.Backend) *fiber.App {
	app := fiber.New()
	app.Use(func(c *fiber.Ctx) error { c.Locals(callerKey, worker); return c.Next() })
	New(backend, testPolicy(), deployment, log, slog.New(slog.NewTextHandler(io.Discard, nil))).Register(app)
	return app
}

// ethMint builds the request core-ledger's remote signer would send: the
// unsigned transaction, its digest, and the claims alongside.
func ethMint(t *testing.T, to common.Address, amount int64, onChainCorrelation, claimedCorrelation string, nonce uint64) map[string]string {
	t.Helper()
	sel := crypto.Keccak256([]byte("bridgeMint(address,uint256,bytes32)"))[:4]
	id := decode.CorrelationIDHash(onChainCorrelation)
	data := append(append(append([]byte{}, sel...), common.LeftPadBytes(alice.Bytes(), 32)...),
		common.LeftPadBytes(big.NewInt(amount).Bytes(), 32)...)
	data = append(data, id[:]...)
	tx := types.NewTx(&types.DynamicFeeTx{
		ChainID: big.NewInt(11155111), Nonce: nonce, GasTipCap: big.NewInt(1), GasFeeCap: big.NewInt(2),
		Gas: 100000, To: &to, Value: big.NewInt(0), Data: data,
	})
	raw, err := tx.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}
	digest := types.LatestSignerForChainID(tx.ChainId()).Hash(tx)
	return map[string]string{
		"chain": "ETHEREUM", "method": "bridgeMint", "key_id": "relayer",
		"digest": hex.EncodeToString(digest[:]), "tx": hex.EncodeToString(raw),
		"amount": big.NewInt(amount).String(), "destination": alice.Hex(), "correlation_id": claimedCorrelation,
	}
}

func solMintReq(t *testing.T, mint solanago.PublicKey, amount uint64, correlation string) map[string]string {
	t.Helper()
	ata, _, err := solanago.FindAssociatedTokenAddress(solWallet, mint)
	if err != nil {
		t.Fatal(err)
	}
	disc := sha256.Sum256([]byte("global:bridge_mint"))
	id := decode.CorrelationIDHash(correlation)
	data := binary.LittleEndian.AppendUint64(append([]byte{}, disc[:8]...), amount)
	data = append(data, id[:]...)
	ix := solanago.NewInstruction(solProgram, solanago.AccountMetaSlice{
		solanago.Meta(mint).WRITE(), solanago.Meta(solanago.NewWallet().PublicKey()),
		solanago.Meta(ata).WRITE(), solanago.Meta(solanago.NewWallet().PublicKey()).WRITE(),
		solanago.Meta(solanago.NewWallet().PublicKey()),
		solanago.Meta(solRelayer).WRITE().SIGNER(),
		solanago.Meta(solanago.TokenProgramID), solanago.Meta(solanago.SystemProgramID),
	}, data)
	tx, err := solanago.NewTransaction([]solanago.Instruction{ix}, solanago.Hash{1}, solanago.TransactionPayer(solRelayer))
	if err != nil {
		t.Fatal(err)
	}
	msg, err := tx.Message.MarshalLegacy()
	if err != nil {
		t.Fatal(err)
	}
	return map[string]string{
		"chain": "SOLANA", "method": "bridgeMint", "key_id": "relayer", "digest": hex.EncodeToString(msg),
		"amount": "", "destination": solWallet.String(), "correlation_id": correlation,
	}
}

type signed struct {
	status   int
	code     string
	sig      string
	replayed bool
}

func post(t *testing.T, app *fiber.App, body map[string]string) signed {
	t.Helper()
	raw, _ := json.Marshal(body)
	req := httptest.NewRequest("POST", "/sign", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var out struct {
		Signature string `json:"signature"`
		Replayed  bool   `json:"replayed"`
		Code      string `json:"code"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&out)
	return signed{status: resp.StatusCode, code: out.Code, sig: out.Signature, replayed: out.Replayed}
}

// ---- tests ----------------------------------------------------------------

func TestIdempotencyFor(t *testing.T) {
	cases := []struct {
		name     string
		existing *audit.Record
		want     idempotency
	}{
		{"nothing signed", nil, fresh},
		{"same bytes", &audit.Record{Digest: "d1", PayloadDigest: "p1"}, replay},
		{"same bytes, legacy row", &audit.Record{Digest: "d1"}, replay},
		{"rebuilt bytes, same payload", &audit.Record{Digest: "d0", PayloadDigest: "p1"}, resign},
		{"different payload", &audit.Record{Digest: "d0", PayloadDigest: "p0"}, conflict},
		{"rebuilt bytes, legacy row", &audit.Record{Digest: "d0"}, conflict},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := idempotencyFor(tc.existing, "d1", "p1"); got != tc.want {
				t.Fatalf("got %d, want %d", got, tc.want)
			}
		})
	}
}

// The lifecycle of one correlation id: signed, replayed, re-signed as a
// rebuilt transaction, and refused for a different payload.
func TestSignIsIdempotentOnThePayload(t *testing.T) {
	log, backend := &memLog{}, &fakeBackend{}
	app := newApp(log, backend)

	first := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", 1))
	if first.status != 200 || first.replayed {
		t.Fatalf("first sign: %+v", first)
	}

	again := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", 1))
	if again.status != 200 || !again.replayed || again.sig != first.sig {
		t.Fatalf("an identical retry must replay the original signature: %+v", again)
	}

	// A retry rebuilt with a fresh nonce. Under the daily limit of 1500 this
	// only passes if the re-sign is not counted on top of the first.
	rebuilt := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", 2))
	if rebuilt.status != 200 || rebuilt.replayed || rebuilt.sig == first.sig {
		t.Fatalf("a rebuilt transaction for the same payload must be re-signed: %+v", rebuilt)
	}

	different := post(t, app, ethMint(t, usdxProxy, 999, "corr-1", "corr-1", 3))
	if different.status != 409 || different.code != "CORRELATION_REUSED" {
		t.Fatalf("a different payload under one correlation id: %+v, want 409 CORRELATION_REUSED", different)
	}
	if backend.signed != 2 {
		t.Fatalf("the backend signed %d times, want 2 (first, rebuilt)", backend.signed)
	}
}

// Every refusal this change adds. Each must reach the backend zero times and
// leave a DENIED record behind.
func TestSignRefusesUnboundOrForeignRequests(t *testing.T) {
	foreignMint := solanago.NewWallet().PublicKey()
	lookalike := common.HexToAddress("0x1111111111111111111111111111111111111112")

	cases := []struct {
		name string
		body func(t *testing.T) map[string]string
	}{
		{"already-signed bytes under a fresh correlation id", func(t *testing.T) map[string]string {
			return ethMint(t, usdxProxy, 10, "corr-1", "corr-2", 1)
		}},
		{"bridge call with no correlation id", func(t *testing.T) map[string]string {
			return ethMint(t, usdxProxy, 10, "corr-1", "", 1)
		}},
		{"not the configured USD-X contract", func(t *testing.T) map[string]string {
			return ethMint(t, lookalike, 10, "corr-1", "corr-1", 1)
		}},
		{"solana mint that is not USD-X", func(t *testing.T) map[string]string {
			return solMintReq(t, foreignMint, 10, "corr-1")
		}},
		{"solana correlation id the message does not carry", func(t *testing.T) map[string]string {
			body := solMintReq(t, solMint, 10, "corr-1")
			body["correlation_id"] = "corr-2"
			return body
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			log, backend := &memLog{}, &fakeBackend{}
			got := post(t, newApp(log, backend), tc.body(t))
			if got.status != 403 || got.code != "POLICY_DENIED" {
				t.Fatalf("got %+v, want 403 POLICY_DENIED", got)
			}
			if backend.signed != 0 {
				t.Fatal("the backend was asked to sign a refused request")
			}
			if log.count(audit.OutcomeDenied) != 1 {
				t.Fatal("the refusal was not recorded")
			}
		})
	}
}

func TestSignAcceptsABoundSolanaMint(t *testing.T) {
	log, backend := &memLog{}, &fakeBackend{}
	got := post(t, newApp(log, backend), solMintReq(t, solMint, 10, "corr-1"))
	if got.status != 200 {
		t.Fatalf("got %+v, want 200", got)
	}
	if log.records[0].PayloadDigest == "" {
		t.Fatal("the allowed record carries no payload digest")
	}
}

// Two replicas can both pass Existing; the append is the last word, and its
// refusal must withhold the signature exactly as the check would have.
func TestSignWithholdsTheSignatureWhenAnotherReplicaBoundTheCorrelation(t *testing.T) {
	log, backend := &memLog{appendErr: audit.ErrPayloadMismatch}, &fakeBackend{}
	got := post(t, newApp(log, backend), ethMint(t, usdxProxy, 10, "corr-1", "corr-1", 1))
	if got.status != 409 || got.code != "CORRELATION_REUSED" || got.sig != "" {
		t.Fatalf("got %+v, want 409 CORRELATION_REUSED with no signature", got)
	}
}
