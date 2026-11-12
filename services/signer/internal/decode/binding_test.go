package decode

import (
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	solanago "github.com/gagliardetto/solana-go"
)

func decodeEth(t *testing.T, tx *types.Transaction) *Decoded {
	t.Helper()
	raw, digest := ethArgs(t, tx)
	d, err := Ethereum(raw, digest, dep)
	if err != nil {
		t.Fatal(err)
	}
	return d
}

func decodeSol(t *testing.T, msg []byte) *Decoded {
	t.Helper()
	d, err := Solana(msg, dep, wallet.String())
	if err != nil {
		t.Fatal(err)
	}
	return d
}

// The id the bytes carry is the one the chain's replay guard is keyed on. A
// correlation id that is not that id makes the signer's idempotency and the
// chain's replay guard disagree about which movement this is.
func TestBindCorrelation(t *testing.T) {
	ata, _, _ := solanago.FindAssociatedTokenAddress(wallet, mint)
	mintEth := decodeEth(t, ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(5)), 1))
	burnEth := decodeEth(t, ethTx(usdx, big.NewInt(0), calldata("bridgeBurn(address,uint256,bytes32)", alice, big.NewInt(5)), 1))
	mintSol := decodeSol(t, message(t, bridgeIx("bridge_mint", 5, ata, true)))
	burnSol := decodeSol(t, message(t, bridgeIx("bridge_burn", 5, ata, true)))
	pause := decodeEth(t, ethTx(usdx, big.NewInt(0), selBytes("pause()"), 1))

	cases := []struct {
		name        string
		d           *Decoded
		correlation string
		wantErr     bool
	}{
		{"ethereum mint, matching id", mintEth, corr, false},
		{"ethereum burn, matching id", burnEth, corr, false},
		{"solana mint, matching id", mintSol, corr, false},
		{"solana burn, matching id", burnSol, corr, false},
		// The two attacks: an already-signed transaction under a fresh id,
		// and an id whose hash the bytes do not carry.
		{"ethereum mint, different id", mintEth, "corr-2", true},
		{"solana mint, different id", mintSol, "corr-2", true},
		{"ethereum burn, different id", burnEth, "corr-1-compensation", true},
		// No id at all would skip idempotency entirely.
		{"ethereum mint, no id", mintEth, "", true},
		{"solana burn, no id", burnSol, "", true},
		// Methods that carry no on-chain id have nothing to bind.
		{"pause, no id", pause, "", false},
		{"pause, any id", pause, "whatever", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := BindCorrelation(tc.d, tc.correlation)
			if (err != nil) != tc.wantErr {
				t.Fatalf("err = %v, wantErr %v", err, tc.wantErr)
			}
		})
	}
}

// The on-chain id is read from the bytes, not assumed: a transaction built for
// another correlation id decodes to that id.
func TestDecodersReadTheOnChainID(t *testing.T) {
	want := CorrelationIDHash("other")
	eth := decodeEth(t, ethTx(usdx, big.NewInt(0), calldataWithID("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(5), "other"), 1))
	if string(eth.OnChainID) != string(want[:]) {
		t.Fatalf("ethereum on-chain id = %x, want %x", eth.OnChainID, want)
	}
	ata, _, _ := solanago.FindAssociatedTokenAddress(wallet, mint)
	sol := decodeSol(t, message(t, bridgeIxFor("bridge_mint", 5, mint, ata, true, "other")))
	if string(sol.OnChainID) != string(want[:]) {
		t.Fatalf("solana on-chain id = %x, want %x", sol.OnChainID, want)
	}
	if sol.Mint != mint.String() {
		t.Fatalf("solana mint = %s, want %s", sol.Mint, mint)
	}
}

// A retry rebuilds the transaction. What it authorises must hash the same;
// anything it authorises differently must not.
func TestPayloadDigest(t *testing.T) {
	data := calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(5))
	base := decodeEth(t, ethTx(usdx, big.NewInt(0), data, 1)).PayloadDigest("ETHEREUM")

	rebuilt := types.NewTx(&types.DynamicFeeTx{
		ChainID: big.NewInt(1), Nonce: 9, GasTipCap: big.NewInt(7), GasFeeCap: big.NewInt(70),
		Gas: 250000, To: &usdx, Value: big.NewInt(0), Data: data,
	})
	if got := decodeEth(t, rebuilt).PayloadDigest("ETHEREUM"); got != base {
		t.Fatal("a new nonce and gas price changed the payload digest")
	}
	if got := decodeEth(t, ethTx(usdx, big.NewInt(0), data, 1)).PayloadDigest("ethereum"); got != base {
		t.Fatal("chain casing changed the payload digest")
	}

	differs := map[string]*types.Transaction{
		"amount":      ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(6)), 1),
		"destination": ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", common.HexToAddress("0x3333333333333333333333333333333333333333"), big.NewInt(5)), 1),
		"method":      ethTx(usdx, big.NewInt(0), calldata("bridgeBurn(address,uint256,bytes32)", alice, big.NewInt(5)), 1),
		"on-chain id": ethTx(usdx, big.NewInt(0), calldataWithID("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(5), "corr-2"), 1),
	}
	for name, tx := range differs {
		if decodeEth(t, tx).PayloadDigest("ETHEREUM") == base {
			t.Errorf("a different %s produced the same payload digest", name)
		}
	}

	// Solana: a fresh blockhash is the retry that made byte equality wrong.
	ata, _, _ := solanago.FindAssociatedTokenAddress(wallet, mint)
	ix := bridgeIx("bridge_mint", 5, ata, true)
	first, err := solanago.NewTransaction([]solanago.Instruction{ix}, solanago.Hash{1}, solanago.TransactionPayer(relayer))
	if err != nil {
		t.Fatal(err)
	}
	retry, err := solanago.NewTransaction([]solanago.Instruction{ix}, solanago.Hash{2}, solanago.TransactionPayer(relayer))
	if err != nil {
		t.Fatal(err)
	}
	a, _ := first.Message.MarshalLegacy()
	b, _ := retry.Message.MarshalLegacy()
	if string(a) == string(b) {
		t.Fatal("fixture: the two messages should differ in their blockhash")
	}
	if decodeSol(t, a).PayloadDigest("SOLANA") != decodeSol(t, b).PayloadDigest("SOLANA") {
		t.Fatal("a fresh blockhash changed the payload digest")
	}
	if decodeSol(t, a).PayloadDigest("SOLANA") == decodeSol(t, message(t, bridgeIx("bridge_mint", 6, ata, true))).PayloadDigest("SOLANA") {
		t.Fatal("a different Solana amount produced the same payload digest")
	}
}

func TestParseDeployment(t *testing.T) {
	prog := program.String()
	mintKey := mint.String()
	cases := []struct {
		name            string
		eth, prog, mint string
		wantErr         string
	}{
		{"all set", usdx.Hex(), prog, mintKey, ""},
		{"lower-case address", strings.ToLower(usdx.Hex()), prog, mintKey, ""},
		{"nothing set", "", "", "", ""},
		{"zero address", "0x0000000000000000000000000000000000000000", prog, mintKey, "zero address"},
		{"not an address", "0x1234", prog, mintKey, "not an Ethereum address"},
		{"bad program", usdx.Hex(), "not-base58-0OIl", mintKey, "USDX_PROGRAM_ID"},
		{"bad mint", usdx.Hex(), prog, "xyz", "USDX_MINT_ADDRESS"},
		{"system program as mint", usdx.Hex(), prog, "11111111111111111111111111111111", "USDX_MINT_ADDRESS"},
		{"program and mint the same", usdx.Hex(), prog, prog, "same account"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := ParseDeployment(tc.eth, tc.prog, tc.mint)
			if tc.wantErr == "" {
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				return
			}
			if err == nil || !strings.Contains(err.Error(), tc.wantErr) {
				t.Fatalf("err = %v, want one mentioning %q", err, tc.wantErr)
			}
		})
	}
}

func TestRequireCompleteNamesWhatIsMissing(t *testing.T) {
	if err := dep.RequireComplete(); err != nil {
		t.Fatalf("a complete deployment was refused: %v", err)
	}
	partial := Deployment{EthContract: usdx, SolProgram: program}
	err := partial.RequireComplete()
	if err == nil || !strings.Contains(err.Error(), "USDX_MINT_ADDRESS") ||
		strings.Contains(err.Error(), "USDX_PROGRAM_ID") {
		t.Fatalf("err = %v, want exactly USDX_MINT_ADDRESS named", err)
	}
}

func selBytes(sig string) []byte {
	s := selector(sig)
	return s[:]
}
