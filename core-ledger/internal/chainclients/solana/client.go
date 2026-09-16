package solana

import (
	"context"
	"crypto/sha256"
	"fmt"
	"math/big"
	"time"

	solanago "github.com/gagliardetto/solana-go"
	ata "github.com/gagliardetto/solana-go/programs/associated-token-account"
	"github.com/gagliardetto/solana-go/rpc"

	"core-ledger/internal/bridge"
)

const (
	mintAuthoritySeed = "mint-authority"
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
	relayer   solanago.PrivateKey
}

// NewClient dials rpcURL and prepares to call usdx_bridge at programID
// against the USD-X mint at mintAddress. relayerKeypairPath is a
// solana-keygen JSON keypair file for the account configured as
// RELAYER_PUBKEY in constants.rs — the only signer bridge_mint/bridge_burn
// accept.
func NewClient(rpcURL, programID, mintAddress, relayerKeypairPath string) (*Client, error) {
	programPk, err := solanago.PublicKeyFromBase58(programID)
	if err != nil {
		return nil, fmt.Errorf("parsing program id: %w", err)
	}
	mintPk, err := solanago.PublicKeyFromBase58(mintAddress)
	if err != nil {
		return nil, fmt.Errorf("parsing mint address: %w", err)
	}
	relayer, err := solanago.PrivateKeyFromSolanaKeygenFile(relayerKeypairPath)
	if err != nil {
		return nil, fmt.Errorf("loading relayer keypair: %w", err)
	}

	return &Client{
		rpc:       rpc.New(rpcURL),
		programID: programPk,
		mint:      mintPk,
		relayer:   relayer,
	}, nil
}

func (c *Client) mintAuthorityPDA() (solanago.PublicKey, error) {
	pda, _, err := solanago.FindProgramAddress([][]byte{[]byte(mintAuthoritySeed)}, c.programID)
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

func (c *Client) sendInstructions(ctx context.Context, feePayer solanago.PrivateKey, instructions ...solanago.Instruction) (string, error) {
	latest, err := c.rpc.GetLatestBlockhash(ctx, rpc.CommitmentFinalized)
	if err != nil {
		return "", fmt.Errorf("fetching latest blockhash: %w", err)
	}

	tx, err := solanago.NewTransaction(instructions, latest.Value.Blockhash, solanago.TransactionPayer(feePayer.PublicKey()))
	if err != nil {
		return "", fmt.Errorf("building transaction: %w", err)
	}

	if _, err := tx.Sign(func(key solanago.PublicKey) *solanago.PrivateKey {
		if key.Equals(feePayer.PublicKey()) {
			return &feePayer
		}
		return nil
	}); err != nil {
		return "", fmt.Errorf("signing transaction: %w", err)
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
	destATA, _, err := solanago.FindAssociatedTokenAddress(destWallet, c.mint)
	if err != nil {
		return "", fmt.Errorf("deriving destination ATA: %w", err)
	}

	createATA := ata.NewCreateIdempotentInstruction(c.relayer.PublicKey(), destWallet, c.mint)

	accounts := solanago.AccountMetaSlice{
		solanago.Meta(c.mint).WRITE(),
		solanago.Meta(mintAuthority),
		solanago.Meta(destATA).WRITE(),
		solanago.Meta(processedMarker).WRITE(),
		solanago.Meta(c.relayer.PublicKey()).WRITE().SIGNER(),
		solanago.Meta(solanago.TokenProgramID),
		solanago.Meta(solanago.SystemProgramID),
	}
	bridgeMint := solanago.NewInstruction(
		c.programID,
		accounts,
		encodeBridgeArgs(anchorDiscriminator("bridge_mint"), amount, correlationID),
	)

	return c.sendInstructions(ctx, c.relayer, createATA.Build(), bridgeMint)
}

// BridgeBurn burns from `from`'s associated token account, using the
// mint-authority PDA as SPL delegate — the owner must have already called
// approve_bridge_delegate (see chains/solana .../instructions/approve_bridge_delegate.rs)
// granting that delegation, since the relayer never holds the owner's key.
func (c *Client) BridgeBurn(from string, amount *big.Int, correlationID string) (string, error) {
	ctx := context.Background()

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
	sourceATA, _, err := solanago.FindAssociatedTokenAddress(ownerWallet, c.mint)
	if err != nil {
		return "", fmt.Errorf("deriving source ATA: %w", err)
	}

	accounts := solanago.AccountMetaSlice{
		solanago.Meta(c.mint).WRITE(),
		solanago.Meta(mintAuthority),
		solanago.Meta(sourceATA).WRITE(),
		solanago.Meta(processedMarker).WRITE(),
		solanago.Meta(c.relayer.PublicKey()).WRITE().SIGNER(),
		solanago.Meta(solanago.TokenProgramID),
		solanago.Meta(solanago.SystemProgramID),
	}
	bridgeBurn := solanago.NewInstruction(
		c.programID,
		accounts,
		encodeBridgeArgs(anchorDiscriminator("bridge_burn"), amount, correlationID),
	)

	return c.sendInstructions(ctx, c.relayer, bridgeBurn)
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
	for {
		statuses, err := c.rpc.GetSignatureStatuses(ctx, true, sig)
		if err == nil && len(statuses.Value) > 0 && statuses.Value[0] != nil {
			status := statuses.Value[0]
			if status.Err != nil {
				return fmt.Errorf("tx %s failed: %v", txHash, status.Err)
			}
			if reachedCommitment(status.ConfirmationStatus, want) {
				return nil
			}
		}
		select {
		case <-ctx.Done():
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
