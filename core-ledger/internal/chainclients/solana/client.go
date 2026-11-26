package solana

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"math/big"
	"strings"
	"time"

	solanago "github.com/gagliardetto/solana-go"
	ata "github.com/gagliardetto/solana-go/programs/associated-token-account"
	"github.com/gagliardetto/solana-go/rpc"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/bridge"
)

const (
	mintAuthoritySeed = "mint-authority"
	configSeed        = "bridge-config" // chains/solana constants.rs CONFIG_SEED
	processedSeed     = "processed"

	pollInterval = 2 * time.Second
	waitTimeout  = 5 * time.Minute
)

// Client wraps solana-go instruction builders built by hand against the
// usdx_bridge Anchor program (chains/solana/programs/usdx_bridge) — no IDL
// codegen involved, just the account layouts and discriminators mirrored
// from that program's source. Same shape as the Ethereum client so
// internal/bridge can treat both uniformly via the ChainClient interface.
type Client struct {
	rpc       *rpc.Client
	programID solanago.PublicKey
	mint      solanago.PublicKey
	signer    Signer
}

// NewClient dials rpcURL and prepares to call usdx_bridge at programID
// against the USD-X mint at mintAddress. relayerKeypairPath is a
// solana-keygen JSON keypair file for the account configured as
// RELAYER_PUBKEY in constants.rs — the only signer bridge_mint/bridge_burn
// accept.
func NewClient(rpcURL, programID, mintAddress, relayerKeypairPath string) (*Client, error) {
	signer, err := NewLocalSigner(relayerKeypairPath)
	if err != nil {
		return nil, err
	}
	return NewClientWithSigner(rpcURL, programID, mintAddress, signer)
}

// NewClientWithSigner is the constructor P6 will call, handing in a signer
// backed by the signer service instead of a keypair file on disk.
func NewClientWithSigner(rpcURL, programID, mintAddress string, signer Signer) (*Client, error) {
	programPk, err := solanago.PublicKeyFromBase58(programID)
	if err != nil {
		return nil, fmt.Errorf("parsing program id: %w", err)
	}
	mintPk, err := solanago.PublicKeyFromBase58(mintAddress)
	if err != nil {
		return nil, fmt.Errorf("parsing mint address: %w", err)
	}

	return &Client{
		rpc:       rpc.New(rpcURL),
		programID: programPk,
		mint:      mintPk,
		signer:    signer,
	}, nil
}

func (c *Client) mintAuthorityPDA() (solanago.PublicKey, error) {
	pda, _, err := solanago.FindProgramAddress([][]byte{[]byte(mintAuthoritySeed)}, c.programID)
	return pda, err
}

// configPDA is the BridgeConfig account (seed "bridge-config"). Since P6 the
// program reads the relayer and the pause flag from it, so bridge_mint and
// bridge_burn fail with a missing-account error without it.
func (c *Client) configPDA() (solanago.PublicKey, error) {
	pda, _, err := solanago.FindProgramAddress([][]byte{[]byte(configSeed)}, c.programID)
	return pda, err
}

func (c *Client) processedMarkerPDA(correlationID string) (solanago.PublicKey, error) {
	hash := bridge.CorrelationIDHash(correlationID)
	pda, _, err := solanago.FindProgramAddress([][]byte{[]byte(processedSeed), hash[:]}, c.programID)
	return pda, err
}

// anchorDiscriminator is Anchor's global instruction discriminator: the
// first 8 bytes of sha256("global:<snake_case_instruction_name>"). Every
// instruction below must use the exact name declared in lib.rs's #[program]
// module.
func anchorDiscriminator(instructionName string) []byte {
	sum := sha256.Sum256([]byte("global:" + instructionName))
	return sum[:8]
}

// encodeBridgeArgs matches lib.rs's bridge_mint/bridge_burn argument order:
// amount (u64, Borsh little-endian) then correlation_id ([u8; 32], raw).
func encodeBridgeArgs(discriminator []byte, amount *big.Int, correlationID string) []byte {
	data := make([]byte, 0, len(discriminator)+8+32)
	data = append(data, discriminator...)

	var amountLE [8]byte
	amount.FillBytes(amountLE[:]) // big-endian into a zeroed buffer...
	for i, j := 0, len(amountLE)-1; i < j; i, j = i+1, j-1 {
		amountLE[i], amountLE[j] = amountLE[j], amountLE[i] // ...then reverse to little-endian
	}
	data = append(data, amountLE[:]...)

	hash := bridge.CorrelationIDHash(correlationID)
	data = append(data, hash[:]...)
	return data
}

// signingContext is what a remote signer needs to apply policy: which
// instruction this is, for which saga, moving how much, to whom. A local
// signer ignores it, which is why sendInstructions takes it unconditionally
// rather than there being two send paths.
type signingContext struct {
	method        string
	correlationID string
	amount        *big.Int
	to            string
}

func (c *Client) sendInstructions(ctx context.Context, sctx signingContext, instructions ...solanago.Instruction) (string, error) {
	latest, err := c.rpc.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return "", fmt.Errorf("fetching latest blockhash: %w", err)
	}

	tx, err := solanago.NewTransaction(instructions, latest.Value.Blockhash, solanago.TransactionPayer(c.signer.PublicKey()))
	if err != nil {
		return "", fmt.Errorf("building transaction: %w", err)
	}

	// Not tx.Sign: its callback must hand back the private key by value,
	// which a signer that does not hold one cannot do. See signer.go.
	if err := signTransaction(tx, bindContext(c.signer, sctx.method, sctx.correlationID, sctx.amount, sctx.to)); err != nil {
		return "", err
	}

	sig, err := c.rpc.SendTransactionWithOpts(ctx, tx, rpc.TransactionOpts{PreflightCommitment: rpc.CommitmentConfirmed})
	if err != nil {
		return "", fmt.Errorf("sending transaction: %w", err)
	}
	return sig.String(), nil
}

// BridgeMint mints to `to`'s associated token account for the USD-X mint,
// creating that ATA first (idempotently) if it doesn't exist yet — the
// destination is a wallet address, not a token account address.
func (c *Client) BridgeMint(to string, amount *big.Int, correlationID string) (string, error) {
	ctx := context.Background()

	if err := c.requireCustodyAddress("mint destination", to); err != nil {
		return "", err
	}

	destWallet, err := solanago.PublicKeyFromBase58(to)
	if err != nil {
		return "", fmt.Errorf("parsing destination address: %w", err)
	}
	mintAuthority, err := c.mintAuthorityPDA()
	if err != nil {
		return "", fmt.Errorf("deriving mint authority PDA: %w", err)
	}
	processedMarker, err := c.processedMarkerPDA(correlationID)
	if err != nil {
		return "", fmt.Errorf("deriving processed marker PDA: %w", err)
	}
	configPDA, err := c.configPDA()
	if err != nil {
		return "", fmt.Errorf("deriving BridgeConfig PDA: %w", err)
	}
	destATA, _, err := solanago.FindAssociatedTokenAddress(destWallet, c.mint)
	if err != nil {
		return "", fmt.Errorf("deriving destination ATA: %w", err)
	}

	createATA := ata.NewCreateIdempotentInstruction(c.signer.PublicKey(), destWallet, c.mint)

	accounts := solanago.AccountMetaSlice{
		solanago.Meta(c.mint).WRITE(),
		solanago.Meta(mintAuthority),
		solanago.Meta(destATA).WRITE(),
		solanago.Meta(processedMarker).WRITE(),
		solanago.Meta(configPDA),
		solanago.Meta(c.signer.PublicKey()).WRITE().SIGNER(),
		solanago.Meta(solanago.TokenProgramID),
		solanago.Meta(solanago.SystemProgramID),
	}
	bridgeMint := solanago.NewInstruction(
		c.programID,
		accounts,
		encodeBridgeArgs(anchorDiscriminator("bridge_mint"), amount, correlationID),
	)

	return c.sendInstructions(ctx,
		signingContext{method: "bridgeMint", correlationID: correlationID, amount: amount, to: to},
		createATA.Build(), bridgeMint)
}

// BridgeBurn burns from `from`'s associated token account, using the
// mint-authority PDA as SPL delegate — the owner must have already called
// approve_bridge_delegate (see chains/solana .../instructions/approve_bridge_delegate.rs)
// granting that delegation, since the relayer never holds the owner's key.
//
// That delegation is what made SOL->ETH bridging impossible before P2: nothing
// drove the call, and no user could be asked to. It is now the platform's own
// account being delegated at boot — see custody.go.
func (c *Client) BridgeBurn(from string, amount *big.Int, correlationID string) (string, error) {
	ctx := context.Background()

	if err := c.requireCustodyAddress("burn source", from); err != nil {
		return "", err
	}

	ownerWallet, err := solanago.PublicKeyFromBase58(from)
	if err != nil {
		return "", fmt.Errorf("parsing source address: %w", err)
	}
	mintAuthority, err := c.mintAuthorityPDA()
	if err != nil {
		return "", fmt.Errorf("deriving mint authority PDA: %w", err)
	}
	processedMarker, err := c.processedMarkerPDA(correlationID)
	if err != nil {
		return "", fmt.Errorf("deriving processed marker PDA: %w", err)
	}
	configPDA, err := c.configPDA()
	if err != nil {
		return "", fmt.Errorf("deriving BridgeConfig PDA: %w", err)
	}
	sourceATA, _, err := solanago.FindAssociatedTokenAddress(ownerWallet, c.mint)
	if err != nil {
		return "", fmt.Errorf("deriving source ATA: %w", err)
	}

	accounts := solanago.AccountMetaSlice{
		solanago.Meta(c.mint).WRITE(),
		solanago.Meta(mintAuthority),
		solanago.Meta(sourceATA).WRITE(),
		solanago.Meta(processedMarker).WRITE(),
		solanago.Meta(configPDA),
		solanago.Meta(c.signer.PublicKey()).WRITE().SIGNER(),
		solanago.Meta(solanago.TokenProgramID),
		solanago.Meta(solanago.SystemProgramID),
	}
	bridgeBurn := solanago.NewInstruction(
		c.programID,
		accounts,
		encodeBridgeArgs(anchorDiscriminator("bridge_burn"), amount, correlationID),
	)

	return c.sendInstructions(ctx,
		signingContext{method: "bridgeBurn", correlationID: correlationID, amount: amount, to: from},
		bridgeBurn)
}

// Pause halts bridge_mint/bridge_burn by setting the BridgeConfig's paused
// flag (set_paused(true), AdminOnly). The API refuses a PAUSE whose signer is
// not the config admin before it ever builds the transaction — see
// IsPauseAuthority.
func (c *Client) Pause(reference string) (string, error) {
	return c.setPaused(context.Background(), true, "pause", reference)
}

// Unpause resumes the bridge (set_paused(false), AdminOnly).
func (c *Client) Unpause(reference string) (string, error) {
	return c.setPaused(context.Background(), false, "unpause", reference)
}

// Blacklist and Unblacklist exist only to satisfy bridge.EnforcementClient:
// the Solana program has no blacklist, and the API validates that combination
// away before it ever reaches a client. Reaching one is a programming error,
// and a clear one is better than a silent no-op.
func (c *Client) Blacklist(_, _ string) (string, error) {
	return "", errors.New("SOLANA: the usdx_bridge program has no blacklist; blacklisting is Ethereum-only")
}

func (c *Client) Unblacklist(_, _ string) (string, error) {
	return "", errors.New("SOLANA: the usdx_bridge program has no blacklist; blacklisting is Ethereum-only")
}

// setPaused builds and submits the program's set_paused instruction. The
// signing context's method is pause/unpause — the policy vocabulary a remote
// signer has rules for — and the reference is carried as the correlation id.
func (c *Client) setPaused(ctx context.Context, paused bool, method, reference string) (string, error) {
	configPDA, err := c.configPDA()
	if err != nil {
		return "", fmt.Errorf("deriving BridgeConfig PDA: %w", err)
	}
	return c.sendInstructions(ctx,
		signingContext{method: method, correlationID: reference},
		c.setPausedInstruction(configPDA, paused))
}

// setPausedInstruction builds the set_paused instruction: config first, the
// admin signer second — config.rs's AdminOnly account order — and the Borsh
// bool after Anchor's global discriminator. Split out so the layout is
// testable without a cluster.
func (c *Client) setPausedInstruction(configPDA solanago.PublicKey, paused bool) solanago.Instruction {
	accounts := solanago.AccountMetaSlice{
		solanago.Meta(configPDA).WRITE(),
		solanago.Meta(c.signer.PublicKey()).SIGNER(),
	}
	data := anchorDiscriminator("set_paused")
	if paused {
		data = append(data, 1)
	} else {
		data = append(data, 0)
	}
	return solanago.NewInstruction(c.programID, accounts, data)
}

// IsPauseAuthority reports whether this client's signer is the BridgeConfig
// admin — the only account set_paused accepts. The program reads the admin
// from the config account's first field after the Anchor discriminator, so
// this reads that account (finalized, so the answer is stable) and compares.
//
// A false answer is not "try anyway": the transaction would revert on the
// InvalidAdmin constraint, and the API refuses the request with a clear 422
// instead of letting compliance mark an executed action failed.
func (c *Client) IsPauseAuthority(ctx context.Context) (bool, error) {
	configPDA, err := c.configPDA()
	if err != nil {
		return false, fmt.Errorf("deriving BridgeConfig PDA: %w", err)
	}

	info, err := c.rpc.GetAccountInfoWithOpts(ctx, configPDA,
		&rpc.GetAccountInfoOpts{Commitment: rpc.CommitmentFinalized})
	if err != nil {
		return false, fmt.Errorf("reading BridgeConfig %s: %w", configPDA, err)
	}
	if info == nil || info.Value == nil {
		return false, fmt.Errorf("BridgeConfig %s does not exist", configPDA)
	}
	data := info.Value.Data.GetBinary()
	// Anchor account layout: 8-byte discriminator, then admin (32 bytes) —
	// the first field of state.rs's BridgeConfig.
	if len(data) < 40 {
		return false, fmt.Errorf("BridgeConfig %s holds %d bytes, want at least 40", configPDA, len(data))
	}
	var admin solanago.PublicKey
	copy(admin[:], data[8:40])
	return admin.Equals(c.signer.PublicKey()), nil
}

// FinalityStatus is the non-blocking half of WaitForFinality, for the
// enforcement sweep: one GetSignatureStatuses call, no polling, finalized as
// the target depth. final=false and nil error means "not there yet"; a
// landed-and-failed signature wraps ErrTxFailedOnChain so the sweep can mark
// the row FAILED without guessing from error text.
func (c *Client) FinalityStatus(txHash string) (bool, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	sig, err := solanago.SignatureFromBase58(txHash)
	if err != nil {
		return false, fmt.Errorf("parsing signature %q: %w", txHash, err)
	}
	statuses, err := c.rpc.GetSignatureStatuses(ctx, true, sig)
	if err != nil {
		return false, fmt.Errorf("checking signature %s: %w", txHash, err)
	}
	if len(statuses.Value) == 0 || statuses.Value[0] == nil {
		return false, nil
	}
	status := statuses.Value[0]
	if status.Err != nil {
		return false, fmt.Errorf("tx %s failed: %v: %w", txHash, status.Err, bridge.ErrTxFailedOnChain)
	}
	return reachedCommitment(status.ConfirmationStatus, rpc.ConfirmationStatusFinalized), nil
}

// WaitForFinality matches bridge.ChainClient's signature (the same string
// vocabulary the saga uses for both chains). finalityLevel here must be one
// of Solana's own commitment levels — "finalized", "confirmed", or
// "processed" — since solana-go's ConfirmationStatusType uses those exact
// strings.
func (c *Client) WaitForFinality(txHash string, finalityLevel string) error {
	ctx, cancel := context.WithTimeout(context.Background(), waitTimeout)
	defer cancel()

	sig, err := solanago.SignatureFromBase58(txHash)
	if err != nil {
		return fmt.Errorf("parsing signature %q: %w", txHash, err)
	}
	want := rpc.ConfirmationStatusType(finalityLevel)
	switch want {
	case rpc.ConfirmationStatusProcessed, rpc.ConfirmationStatusConfirmed, rpc.ConfirmationStatusFinalized:
	default:
		return fmt.Errorf("finalityLevel must be a Solana commitment level (processed/confirmed/finalized), got %q", finalityLevel)
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	// included is whether the cluster has reported this signature as landed
	// without error, which is what separates "not final yet" from "never
	// seen" when the wait runs out.
	included := false
	for {
		statuses, err := c.rpc.GetSignatureStatuses(ctx, true, sig)
		if err == nil && len(statuses.Value) > 0 && statuses.Value[0] != nil {
			status := statuses.Value[0]
			if status.Err != nil {
				// Landed and failed: the signature is permanently failed, so
				// the saga must treat it as terminal rather than wait on it
				// again. The underlying error text is kept for operators.
				return fmt.Errorf("tx %s failed: %v: %w", txHash, status.Err, bridge.ErrTxFailedOnChain)
			}
			if reachedCommitment(status.ConfirmationStatus, want) {
				return nil
			}
			included = true
		}
		select {
		case <-ctx.Done():
			if included {
				return fmt.Errorf("timed out waiting for tx %s to reach %q: %w: %w", txHash, finalityLevel, bridge.ErrNotFinal, ctx.Err())
			}
			return fmt.Errorf("timed out waiting for tx %s to reach %q: %w", txHash, finalityLevel, ctx.Err())
		case <-ticker.C:
		}
	}
}

func reachedCommitment(have, want rpc.ConfirmationStatusType) bool {
	rank := map[rpc.ConfirmationStatusType]int{
		rpc.ConfirmationStatusProcessed: 0,
		rpc.ConfirmationStatusConfirmed: 1,
		rpc.ConfirmationStatusFinalized: 2,
	}
	return rank[have] >= rank[want]
}

// ValidTxHash reports whether txHash is a well-formed Solana signature (a
// base58 encoding of 64 bytes).
func (c *Client) ValidTxHash(txHash string) bool {
	_, err := solanago.SignatureFromBase58(txHash)
	return err == nil
}

// VerifyBurn is the on-chain half of H4's break-glass control — the Solana
// twin of the Ethereum client's. It reads the transaction at the `finalized`
// commitment (so a positive answer is final by construction), checks it
// succeeded, and finds the bridge_burn instruction for this client's program,
// decoding amount (u64, little-endian) and correlation id ([u8; 32]) from the
// same layout encodeBridgeArgs writes. The token account at index 2 of that
// instruction must be the associated token account derived from `from` and the
// mint — `from` is the custody wallet address, and the ATA is where its
// USD-X lives.
func (c *Client) VerifyBurn(ctx context.Context, txHash, from string, amount *big.Int, correlationID string) error {
	sig, err := solanago.SignatureFromBase58(txHash)
	if err != nil {
		return fmt.Errorf("parsing signature %q: %w", txHash, err)
	}

	maxTxVersion := uint64(0)
	tx, err := c.rpc.GetTransaction(ctx, sig, &rpc.GetTransactionOpts{
		Commitment:                     rpc.CommitmentFinalized,
		MaxSupportedTransactionVersion: &maxTxVersion,
	})
	if err != nil {
		// solana-go surfaces a null result as a "not found" error, so this is
		// where "the cluster has nothing finalised under this signature"
		// arrives. The signature may still exist below finality — that is a
		// different answer from "never seen", and a different typed error.
		statuses, serr := c.rpc.GetSignatureStatuses(ctx, true, sig)
		if serr == nil && len(statuses.Value) > 0 && statuses.Value[0] != nil {
			return fmt.Errorf("burn %s is not final yet: %w", txHash, bridge.ErrBurnNotFinal)
		}
		if strings.Contains(strings.ToLower(err.Error()), "not found") {
			return fmt.Errorf("burn %s: %w", txHash, bridge.ErrBurnNotFound)
		}
		return fmt.Errorf("reading burn %s: %w", txHash, err)
	}
	if tx == nil || tx.Transaction == nil {
		// Defensive twin of the branch above: if the client ever returns
		// nil, nil, the statuses call still tells the two answers apart.
		statuses, serr := c.rpc.GetSignatureStatuses(ctx, true, sig)
		if serr == nil && len(statuses.Value) > 0 && statuses.Value[0] != nil {
			return fmt.Errorf("burn %s is not final yet: %w", txHash, bridge.ErrBurnNotFinal)
		}
		return fmt.Errorf("burn %s: %w", txHash, bridge.ErrBurnNotFound)
	}

	if tx.Meta != nil && tx.Meta.Err != nil {
		return fmt.Errorf("burn %s reverted: %v: %w", txHash, tx.Meta.Err, bridge.ErrBurnReverted)
	}

	parsed, err := tx.Transaction.GetTransaction()
	if err != nil {
		return fmt.Errorf("decoding burn %s: %w", txHash, err)
	}
	if parsed == nil {
		return fmt.Errorf("burn %s: %w: the transaction carries no decodable message", txHash, bridge.ErrBurnNotFound)
	}

	instr, found := findBridgeBurn(parsed.Message, c.programID)
	if !found {
		return fmt.Errorf("burn %s: %w: no bridge_burn instruction for program %s", txHash, bridge.ErrBurnNotFound, c.programID)
	}
	if len(instr.Data) < 8+8+32 {
		return fmt.Errorf("burn %s: %w: bridge_burn data is %d bytes, want %d", txHash, bridge.ErrBurnNotFound, len(instr.Data), 8+8+32)
	}

	gotAmount := new(big.Int).SetUint64(binary.LittleEndian.Uint64(instr.Data[8:16]))
	if gotAmount.Cmp(amount) != 0 {
		return &bridge.ErrBurnMismatch{Field: "amount"}
	}
	var gotCorrelation [32]byte
	copy(gotCorrelation[:], instr.Data[16:48])
	if gotCorrelation != bridge.CorrelationIDHash(correlationID) {
		return &bridge.ErrBurnMismatch{Field: "correlation_id"}
	}

	// BridgeBurn's account order (chains/solana .../bridge_burn.rs): mint,
	// mint_authority, source, processed_marker, config, relayer, token_program,
	// system_program — so the source token account is index 2.
	if len(instr.Accounts) < 3 || int(instr.Accounts[2]) >= len(parsed.Message.AccountKeys) {
		return fmt.Errorf("burn %s: %w: bridge_burn names fewer than three accounts", txHash, bridge.ErrBurnNotFound)
	}
	sourceATA := parsed.Message.AccountKeys[instr.Accounts[2]]

	fromWallet, err := solanago.PublicKeyFromBase58(from)
	if err != nil {
		return fmt.Errorf("parsing source address: %w", err)
	}
	expectedATA, _, err := solanago.FindAssociatedTokenAddress(fromWallet, c.mint)
	if err != nil {
		return fmt.Errorf("deriving source ATA: %w", err)
	}
	if !sourceATA.Equals(expectedATA) {
		return &bridge.ErrBurnMismatch{Field: "from"}
	}
	return nil
}

// findBridgeBurn returns the compiled instruction for programID whose data
// begins with Anchor's bridge_burn discriminator — the same discriminator
// encodeBridgeArgs writes.
func findBridgeBurn(message solanago.Message, programID solanago.PublicKey) (solanago.CompiledInstruction, bool) {
	programIndex := -1
	for i, key := range message.AccountKeys {
		if key.Equals(programID) {
			programIndex = i
			break
		}
	}
	if programIndex < 0 {
		return solanago.CompiledInstruction{}, false
	}

	wantDisc := anchorDiscriminator("bridge_burn")
	for _, instr := range message.Instructions {
		if int(instr.ProgramIDIndex) != programIndex {
			continue
		}
		if len(instr.Data) >= len(wantDisc) && bytes.Equal(instr.Data[:len(wantDisc)], wantDisc) {
			return instr, true
		}
	}
	return solanago.CompiledInstruction{}, false
}

func (c *Client) TotalSupply() (*big.Int, uint64, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	result, err := c.rpc.GetTokenSupply(ctx, c.mint, rpc.CommitmentFinalized)
	if err != nil {
		return nil, 0, fmt.Errorf("calling getTokenSupply: %w", err)
	}

	supply, ok := new(big.Int).SetString(result.Value.Amount, 10)
	if !ok {
		return nil, 0, fmt.Errorf("unexpected token supply amount %q", result.Value.Amount)
	}
	return supply, result.Context.Slot, nil
}
