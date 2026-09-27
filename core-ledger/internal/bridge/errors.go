package bridge

import "strings"

// Class is how the saga decides between "try again" and "give the money back".
//
// Getting this wrong in either direction is expensive. Treating a transient
// RPC blip as terminal un-mints a perfectly healthy transfer and spawns a
// compensating mint for nothing — which is exactly what the old saga did,
// jumping straight from one failed call to compensation. Treating a real
// revert as transient burns the attempt budget and delays the refund, which
// is merely slow. So anything unrecognised is transient: the failure mode of
// guessing wrong is asymmetric, and the budget bounds how long a wrong guess
// can last.
type Class int

const (
	// ClassTransient is worth another attempt: timeouts, dropped connections,
	// rate limits, an RPC node having a bad minute.
	ClassTransient Class = iota

	// ClassTerminal will fail identically forever: the contract reverted, the
	// signer lacks the role, the address is blacklisted.
	ClassTerminal

	// ClassAlreadyProcessed is the replay guard on either chain firing —
	// processedMints/processedBurns on Ethereum, the ("processed", id) marker
	// PDA on Solana. It is not a failure at all: it is proof the call this
	// saga is retrying already landed, which is precisely what happens when a
	// worker is killed between the RPC returning and the tx hash being
	// committed. Compensating here would destroy real money.
	ClassAlreadyProcessed
)

// Classify inspects a chain client error.
//
// It matches on message text because that is genuinely all either chain
// offers here: go-ethereum surfaces a revert as an opaque
// "execution reverted: <string>" and solana-go surfaces a failed instruction
// as a "custom program error: 0x…" map. Neither has a typed error to switch
// on, and inventing one per client would only move the string matching.
func Classify(err error) Class {
	if err == nil {
		return ClassTransient
	}
	msg := strings.ToLower(err.Error())

	// Both chains' replay guards, checked before the general terminal rules —
	// an "already minted" revert is still a revert, and the order is what
	// keeps it from being read as one.
	for _, s := range []string{
		"already minted",    // USDX.sol processedMints
		"already burned",    // USDX.sol processedBurns
		"already in use",    // Anchor `init` on an existing ProcessedMarker PDA
		"already processed", // defensive: either chain, if the wording changes
	} {
		if strings.Contains(msg, s) {
			return ClassAlreadyProcessed
		}
	}

	for _, s := range []string{
		"execution reverted",   // go-ethereum, any require/revert
		"custom program error", // solana-go, any Anchor ErrorCode
		"insufficient funds",   // relayer is out of gas; retrying won't refill it
		"invalid opcode",
		"account is blacklisted",
		"pausable: paused",
		"accesscontrol", // relayer lost BRIDGE_ROLE
		"invalid address",
		"no delegate approval", // ErrorCode::NoDelegateApproval
		"delegated amount",     // ErrorCode::InsufficientDelegatedAmount
		"only the configured relayer",
		// A wallet stamped with an address this platform does not custody.
		// Retrying cannot change which address the wallet names.
		"platform-custodied",
	} {
		if strings.Contains(msg, s) {
			return ClassTerminal
		}
	}

	return ClassTransient
}
