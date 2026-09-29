package solana

import (
	"context"
	"encoding/binary"
	"fmt"
	"math"

	solanago "github.com/gagliardetto/solana-go"
	ata "github.com/gagliardetto/solana-go/programs/associated-token-account"
)

// ---------------------------------------------------------------------------
// Platform-custodied Solana token accounts
//
// The problem this resolves: Ethereum's bridgeBurn burns any holder's balance
// unconditionally under BRIDGE_ROLE, while Solana's requires the token
// account's owner to have granted the mint-authority PDA as an SPL delegate
// via approve_bridge_delegate — and nothing drove that call. The relayer never
// holds a user's Solana key, so SOL->ETH bridging and Solana redemptions could
// not happen at all.
//
// The resolution (docs/building-plan.md, Open decision 1) is that the platform
// owns the Solana token accounts: it creates its own ATA for the USD-X mint
// and delegates burn authority over it to the mint-authority PDA once. That
// matches the trust model Ethereum already has — where BRIDGE_ROLE can burn
// any holder — rather than inventing a second, weaker one for Solana.
//
// What it costs, stated plainly: there is no self-custody on Solana. A user's
// Solana USD-X balance is a claim in core-ledger against a pooled on-chain
// account, not a balance in a wallet they control. Per-user segregation lives
// in the journal, which is where this platform has always said value lives.
// Self-custody becomes a separate track (a wallet-connect
// approve_bridge_delegate step, needing @solana/wallet-adapter on the
// frontend), not a variation of this one.
// ---------------------------------------------------------------------------

// unlimitedDelegation is what the platform grants the mint-authority PDA over
// its own account. A finite allowance would need topping up on a schedule
// nobody owns, and would fail burns in the middle of a redemption when it ran
// out — which is a worse failure than the one a ceiling would prevent, given
// the delegate is a PDA of the program that is already the mint authority.
const unlimitedDelegation = uint64(math.MaxUint64)

// CustodyAddress is the account that owns every Solana USD-X token account
// this platform touches. It is the relayer's own address, so there is exactly
// one answer and it cannot drift from the key that signs.
func (c *Client) CustodyAddress() string {
	return c.signer.PublicKey().String()
}

// custodyATA is where all Solana USD-X actually sits.
func (c *Client) custodyATA() (solanago.PublicKey, error) {
	address, _, err := solanago.FindAssociatedTokenAddress(c.signer.PublicKey(), c.mint)
	if err != nil {
		return solanago.PublicKey{}, fmt.Errorf("deriving the custody ATA: %w", err)
	}
	return address, nil
}

// EnsureCustody creates the platform's token account if it doesn't exist and
// grants the mint-authority PDA delegate authority over it.
//
// Both instructions are idempotent by construction — CreateIdempotent is a
// no-op on an existing account, and Approve overwrites rather than accumulates
// — so this runs at worker boot rather than being tracked as a one-off
// migration somebody has to remember to have run. Re-granting also refreshes
// the allowance, which is the point of running it on a schedule at all.
func (c *Client) EnsureCustody(ctx context.Context) (string, error) {
	owner := c.signer.PublicKey()

	custody, err := c.custodyATA()
	if err != nil {
		return "", err
	}
	mintAuthority, err := c.mintAuthorityPDA()
	if err != nil {
		return "", fmt.Errorf("deriving mint authority PDA: %w", err)
	}

	createATA := ata.NewCreateIdempotentInstruction(owner, owner, c.mint).Build()
	approve := approveBridgeDelegateInstruction(c.programID, owner, custody, mintAuthority, unlimitedDelegation)

	// No amount and no correlation id: EnsureCustody grants the delegation
	// the bridge later burns through, it moves nothing itself. A policy rule
	// for it is about *who* may call it, not how much.
	return c.sendInstructions(ctx, signingContext{method: "approveBridgeDelegate"}, createATA, approve)
}

// approveBridgeDelegateInstruction builds the program's
// approve_bridge_delegate call. Account order mirrors the ApproveBridgeDelegate
// struct in chains/solana/programs/usdx_bridge/src/instructions/approve_bridge_delegate.rs
// exactly — Anchor matches accounts by position, so a reordering here is
// rejected by constraint checks rather than by anything that says "wrong
// order".
func approveBridgeDelegateInstruction(
	programID, owner, source, mintAuthority solanago.PublicKey,
	amount uint64,
) solanago.Instruction {
	data := make([]byte, 0, 8+8)
	data = append(data, anchorDiscriminator("approve_bridge_delegate")...)

	var amountLE [8]byte
	binary.LittleEndian.PutUint64(amountLE[:], amount)
	data = append(data, amountLE[:]...)

	return solanago.NewInstruction(programID, solanago.AccountMetaSlice{
		solanago.Meta(owner).WRITE().SIGNER(),
		solanago.Meta(source).WRITE(),
		solanago.Meta(mintAuthority),
		solanago.Meta(solanago.TokenProgramID),
	}, data)
}

// requireCustodyAddress rejects an address this platform does not custody.
//
// The alternative — quietly redirecting to the custody account whatever
// address the caller asked for — would mint to somewhere other than the place
// named in the request, which is the kind of silence that makes a reconciliation
// break impossible to explain later.
func (c *Client) requireCustodyAddress(role, address string) error {
	if address == c.CustodyAddress() {
		return nil
	}
	return fmt.Errorf(
		"platform-custodied: Solana USD-X %s must be the custody account %s, got %s — "+
			"see internal/chainclients/solana/custody.go",
		role, c.CustodyAddress(), address)
}
