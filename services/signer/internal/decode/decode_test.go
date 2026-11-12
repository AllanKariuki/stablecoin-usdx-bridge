package decode

import (
	"crypto/sha256"
	"encoding/binary"
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	solanago "github.com/gagliardetto/solana-go"
	"github.com/gagliardetto/solana-go/programs/associated-token-account"
)

var (
	usdx  = common.HexToAddress("0x1111111111111111111111111111111111111111")
	alice = common.HexToAddress("0x2222222222222222222222222222222222222222")
)

// corr is the correlation id every fixture's on-chain id is derived from,
// the way core-ledger derives it.
const corr = "corr-1"

// dep is the deployment every fixture targets: usdx on Ethereum, program and
// mint (declared with the Solana fixtures below) on Solana.
var dep = Deployment{EthContract: usdx, SolProgram: program, SolMint: mint}

func calldata(sig string, addr common.Address, amount *big.Int) []byte {
	return calldataWithID(sig, addr, amount, corr)
}

func calldataWithID(sig string, addr common.Address, amount *big.Int, correlationID string) []byte {
	sel := selector(sig)
	id := CorrelationIDHash(correlationID)
	out := append([]byte{}, sel[:]...)
	out = append(out, common.LeftPadBytes(addr.Bytes(), 32)...)
	out = append(out, common.LeftPadBytes(amount.Bytes(), 32)...)
	out = append(out, id[:]...)
	return out
}

func ethTx(to common.Address, value *big.Int, data []byte, chain int64) *types.Transaction {
	return types.NewTx(&types.DynamicFeeTx{
		ChainID: big.NewInt(chain), Nonce: 1, GasTipCap: big.NewInt(1), GasFeeCap: big.NewInt(2),
		Gas: 100000, To: &to, Value: value, Data: data,
	})
}

func ethArgs(t *testing.T, tx *types.Transaction) (raw, digest []byte) {
	t.Helper()
	raw, err := tx.MarshalBinary()
	if err != nil {
		t.Fatal(err)
	}
	h := types.LatestSignerForChainID(tx.ChainId()).Hash(tx)
	return raw, h[:]
}

func TestEthereumDecodesWhatTheBytesSay(t *testing.T) {
	tx := ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(10_000_000)), 11155111)
	raw, digest := ethArgs(t, tx)

	d, err := Ethereum(raw, digest, dep)
	if err != nil {
		t.Fatal(err)
	}
	if d.Method != "bridgeMint" || d.Amount.Cmp(big.NewInt(10_000_000)) != 0 ||
		!strings.EqualFold(d.Destination, alice.Hex()) || !strings.EqualFold(d.Target, usdx.Hex()) {
		t.Fatalf("decoded %+v", d)
	}
}

// The attack this package exists for: a caller that describes a large mint as
// a small one.
func TestEthereumRefusesAClaimThatDisagreesWithTheTransaction(t *testing.T) {
	tx := ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(10_000_000)), 1)
	raw, digest := ethArgs(t, tx)
	d, err := Ethereum(raw, digest, dep)
	if err != nil {
		t.Fatal(err)
	}
	if err := Reconcile(d, "bridgeMint", "1", alice.Hex()); err == nil {
		t.Fatal("a claimed amount of 1 against a 10,000,000 mint must be refused")
	}
	if err := Reconcile(d, "bridgeBurn", "10000000", alice.Hex()); err == nil {
		t.Fatal("a claimed method that is not the transaction's must be refused")
	}
	if err := Reconcile(d, "bridgeMint", "10000000", common.HexToAddress("0x3333333333333333333333333333333333333333").Hex()); err == nil {
		t.Fatal("a claimed destination that is not the transaction's must be refused")
	}
	if err := Reconcile(d, "bridgeMint", "10000000", strings.ToLower(alice.Hex())); err != nil {
		t.Fatalf("a correct claim in a different address casing must pass: %v", err)
	}
}

func TestEthereumRefusesWhatItCannotProve(t *testing.T) {
	good := ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(1)), 1)
	raw, digest := ethArgs(t, good)

	// Digest of a different (bigger) transaction than the one sent.
	big1 := ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(9_999_999_999)), 1)
	_, otherDigest := ethArgs(t, big1)

	cases := map[string]func() error{
		"no tx":           func() error { _, e := Ethereum(nil, digest, dep); return e },
		"digest mismatch": func() error { _, e := Ethereum(raw, otherDigest, dep); return e },
		"garbage tx":      func() error { _, e := Ethereum([]byte{1, 2, 3}, digest, dep); return e },
		"not the configured USD-X contract": func() error {
			lookalike := common.HexToAddress("0x1111111111111111111111111111111111111112")
			r, dg := ethArgs(t, ethTx(lookalike, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(1)), 1))
			_, e := Ethereum(r, dg, dep)
			return e
		},
		"no USD-X contract configured": func() error { _, e := Ethereum(raw, digest, Deployment{}); return e },
		"carries ETH value": func() error {
			tx := ethTx(usdx, big.NewInt(1), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(1)), 1)
			r, dg := ethArgs(t, tx)
			_, e := Ethereum(r, dg, dep)
			return e
		},
		"unknown selector": func() error {
			tx := ethTx(usdx, big.NewInt(0), append([]byte{0xde, 0xad, 0xbe, 0xef}, make([]byte, 96)...), 1)
			r, dg := ethArgs(t, tx)
			_, e := Ethereum(r, dg, dep)
			return e
		},
		"dirty address word": func() error {
			data := calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(1))
			data[4] = 0xff
			r, dg := ethArgs(t, ethTx(usdx, big.NewInt(0), data, 1))
			_, e := Ethereum(r, dg, dep)
			return e
		},
		"short calldata": func() error {
			r, dg := ethArgs(t, ethTx(usdx, big.NewInt(0), calldata("bridgeMint(address,uint256,bytes32)", alice, big.NewInt(1))[:60], 1))
			_, e := Ethereum(r, dg, dep)
			return e
		},
	}
	for name, run := range cases {
		if run() == nil {
			t.Errorf("%s: expected a refusal", name)
		}
	}
}

// ---- Solana ---------------------------------------------------------------

var (
	program = solanago.MustPublicKeyFromBase58("9GFGtYxGtZg8Smk4yyya7zAT6V3WcLDsB9XWWQbxMS8")
	relayer = solanago.NewWallet().PublicKey()
	mint    = solanago.NewWallet().PublicKey()
	wallet  = solanago.NewWallet().PublicKey()
)

func bridgeData(name string, amount uint64, correlationID string) []byte {
	sum := sha256.Sum256([]byte("global:" + name))
	id := CorrelationIDHash(correlationID)
	data := append([]byte{}, sum[:8]...)
	data = binary.LittleEndian.AppendUint64(data, amount)
	return append(data, id[:]...)
}

// bridgeIx mirrors the account order core-ledger's Solana client builds:
// mint, mint_authority, token account, processed_marker, config, relayer,
// token program, system program.
func bridgeIx(name string, amount uint64, tokenAcct solanago.PublicKey, withConfig bool) solanago.Instruction {
	return bridgeIxFor(name, amount, mint, tokenAcct, withConfig, corr)
}

func bridgeIxFor(name string, amount uint64, mintKey, tokenAcct solanago.PublicKey, withConfig bool, correlationID string) solanago.Instruction {
	accts := solanago.AccountMetaSlice{
		solanago.Meta(mintKey).WRITE(), solanago.Meta(solanago.NewWallet().PublicKey()),
		solanago.Meta(tokenAcct).WRITE(), solanago.Meta(solanago.NewWallet().PublicKey()).WRITE(),
	}
	if withConfig {
		accts = append(accts, solanago.Meta(solanago.NewWallet().PublicKey()))
	}
	accts = append(accts, solanago.Meta(relayer).WRITE().SIGNER(),
		solanago.Meta(solanago.TokenProgramID), solanago.Meta(solanago.SystemProgramID))
	return solanago.NewInstruction(program, accts, bridgeData(name, amount, correlationID))
}

func message(t *testing.T, ixs ...solanago.Instruction) []byte {
	t.Helper()
	tx, err := solanago.NewTransaction(ixs, solanago.Hash{1}, solanago.TransactionPayer(relayer))
	if err != nil {
		t.Fatal(err)
	}
	b, err := tx.Message.MarshalLegacy()
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestSolanaDecodesMintAndBindsTheWallet(t *testing.T) {
	ata, _, _ := solanago.FindAssociatedTokenAddress(wallet, mint)
	msg := message(t,
		associatedtokenaccount.NewCreateIdempotentInstruction(relayer, wallet, mint).Build(),
		bridgeIx("bridge_mint", 123, ata, true))

	d, err := Solana(msg, dep, wallet.String())
	if err != nil {
		t.Fatal(err)
	}
	if d.Method != "bridgeMint" || d.Amount.Cmp(big.NewInt(123)) != 0 || d.Destination != wallet.String() {
		t.Fatalf("decoded %+v", d)
	}

	burn, err := Solana(message(t, bridgeIx("bridge_burn", 7, ata, true)), dep, wallet.String())
	if err != nil || burn.Method != "bridgeBurn" {
		t.Fatalf("burn: %+v %v", burn, err)
	}
}

func TestSolanaRefusesWhatItCannotProve(t *testing.T) {
	ata, _, _ := solanago.FindAssociatedTokenAddress(wallet, mint)
	otherWallet := solanago.NewWallet().PublicKey()
	otherATA, _, _ := solanago.FindAssociatedTokenAddress(otherWallet, mint)
	// A mint anyone could create with the program's mint-authority PDA as its
	// authority, and the claimed wallet's token account for it.
	fakeMint := solanago.NewWallet().PublicKey()
	fakeATA, _, _ := solanago.FindAssociatedTokenAddress(wallet, fakeMint)

	cases := map[string]func() error{
		"mint is not the configured USD-X mint": func() error {
			_, e := Solana(message(t, bridgeIxFor("bridge_mint", 1, fakeMint, fakeATA, true, corr)), dep, wallet.String())
			return e
		},
		"mint is not the configured USD-X mint, with its ATA create": func() error {
			_, e := Solana(message(t,
				associatedtokenaccount.NewCreateIdempotentInstruction(relayer, wallet, fakeMint).Build(),
				bridgeIxFor("bridge_mint", 1, fakeMint, fakeATA, true, corr)), dep, wallet.String())
			return e
		},
		"no mint configured": func() error {
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, ata, true)),
				Deployment{SolProgram: program}, wallet.String())
			return e
		},
		"ATA create for another wallet": func() error {
			_, e := Solana(message(t,
				associatedtokenaccount.NewCreateIdempotentInstruction(relayer, otherWallet, mint).Build(),
				bridgeIx("bridge_mint", 1, ata, true)), dep, wallet.String())
			return e
		},
		"ATA create for another mint": func() error {
			_, e := Solana(message(t,
				associatedtokenaccount.NewCreateIdempotentInstruction(relayer, wallet, fakeMint).Build(),
				bridgeIx("bridge_mint", 1, ata, true)), dep, wallet.String())
			return e
		},
		"claimed wallet is not the token account's owner": func() error {
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, otherATA, true)), dep, wallet.String())
			return e
		},
		"BridgeConfig account missing": func() error {
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, ata, false)), dep, wallet.String())
			return e
		},
		"program not allowed": func() error {
			other := dep
			other.SolProgram = solanago.NewWallet().PublicKey()
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, ata, true)), other, wallet.String())
			return e
		},
		"nothing configured": func() error {
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, ata, true)), Deployment{}, wallet.String())
			return e
		},
		"smuggled system transfer": func() error {
			// system.NewTransferInstruction equivalent: a raw System Program call.
			steal := solanago.NewInstruction(solanago.SystemProgramID,
				solanago.AccountMetaSlice{solanago.Meta(relayer).WRITE().SIGNER(), solanago.Meta(wallet).WRITE()},
				[]byte{2, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0})
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, ata, true), steal), dep, wallet.String())
			return e
		},
		"unknown instruction": func() error {
			_, e := Solana(message(t, bridgeIx("set_relayer", 1, ata, true)), dep, wallet.String())
			return e
		},
		"two bridge instructions": func() error {
			_, e := Solana(message(t, bridgeIx("bridge_mint", 1, ata, true), bridgeIx("bridge_mint", 1, ata, true)), dep, wallet.String())
			return e
		},
		"trailing bytes": func() error {
			_, e := Solana(append(message(t, bridgeIx("bridge_mint", 1, ata, true)), 0), dep, wallet.String())
			return e
		},
		"empty": func() error { _, e := Solana(nil, dep, wallet.String()); return e },
	}
	for name, run := range cases {
		if run() == nil {
			t.Errorf("%s: expected a refusal", name)
		}
	}
}
