package bridge

import (
	"errors"
	"fmt"
	"strings"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/chainclients/signerclient"
)

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

	// ClassRefused is services/signer declining to sign: a policy denial, a
	// correlation id already bound to a different payload, or the re-sign cap
	// for this movement reached. Like ClassTerminal it will fail identically
	// forever, so it is never retried. Unlike ClassTerminal it never unwinds
	// anything.
	//
	// The difference is what the saga cannot see. A refusal comes from inside
	// BridgeMint/BridgeBurn, before a hash is recorded — and a hash goes
	// unrecorded exactly when an earlier attempt signed, maybe broadcast, and
	// then lost its answer. Correlation reuse and the re-sign cap say outright
	// that a signature for this id exists; a policy denial can arrive on a
	// re-sign as easily as on a first sign (a limit tightened, the day's
	// total filled by others). Any of those earlier signatures may still
	// land. Reversing the ledger, or re-minting on the source chain, against
	// a transaction that may yet confirm is how money gets created twice — so
	// the saga is parked for an operator with its money where it is, and
	// resolving the dead letter (after a limit is raised, or the chain is
	// checked) puts it back in the queue.
	ClassRefused
)

// ErrTxFailedOnChain marks a transaction that was mined and then failed.
//
// It is distinct from a pre-flight revert: that one never produced a hash, so
// the saga can retry from the submission step. This one landed and the chain
// recorded a failure for it, which means that exact hash can never succeed.
// Retrying would only burn the attempt budget, so it is terminal. Both chain
// clients wrap it so the decision does not depend on a chain's error wording.
var ErrTxFailedOnChain = errors.New("transaction failed on chain")

// The typed outcomes of a break-glass burn verification (H4). A maker-checker
// approval now has to be backed by proof on chain before fiat is released, and
// these are what let the callback handler record *why* an approved burn could
// not be settled — a distinct answer for every way the proof can fail, rather
// than one opaque "verification failed".
var (
	// ErrBurnNotFound means the chain has no such transaction — or, on
	// Ethereum, a transaction with no BridgeBurned event from the USDX proxy.
	ErrBurnNotFound = errors.New("burn not found on chain")

	// ErrBurnReverted means the transaction landed and failed, so the burn it
	// claims can never have happened.
	ErrBurnReverted = errors.New("the burn transaction reverted on chain")

	// ErrBurnNotFinal means the transaction is on chain and included, and has
	// simply not reached the configured finality depth yet.
	ErrBurnNotFinal = errors.New("the burn transaction is not final yet")
)

// ErrBurnMismatch means a burn was found on the right contract or program, and
// it is not the burn that was approved. Field names which of the verified
// values disagreed: "contract"/"program", "from", "amount", "correlation_id"
// or "count".
type ErrBurnMismatch struct {
	Field string
}

func (e *ErrBurnMismatch) Error() string {
	return fmt.Sprintf("burn mismatch: %s", e.Field)
}

// Classify inspects a chain client error.
//
// The signer's refusals are typed (signerclient), so they are matched with
// errors.As — and first, because a refusal's reason is free text that could
// contain any of the substrings below. A transaction that was mined and then
// failed is the other typed case: both chain clients wrap ErrTxFailedOnChain,
// which classifyChainError matches with errors.Is. Everything else is matched
// on message text, because that is genuinely all either chain offers here:
// go-ethereum surfaces a pre-flight revert as an opaque "execution reverted:
// <string>" and solana-go surfaces a failed instruction as a "custom program
// error: 0x…" map. Neither has a typed error to switch on, and inventing one
// per client would only move the string matching.
func Classify(err error) Class {
	if err == nil {
		return ClassTransient
	}
	if isSignerRefusal(err) {
		return ClassRefused
	}
	return classifyChainError(err)
}

// isSignerRefusal reports whether services/signer declined to sign, however
// many layers of chain-client wrapping sit on top of its answer.
func isSignerRefusal(err error) bool {
	var (
		denied *signerclient.PolicyDeniedError
		reused *signerclient.CorrelationReusedError
		capped *signerclient.ResignLimitError
	)
	return errors.As(err, &denied) || errors.As(err, &reused) || errors.As(err, &capped)
}

// classifyChainError is the message-text half of Classify, for what the
// chains themselves said.
func classifyChainError(err error) Class {
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

	// A transaction that was mined and then failed will fail identically
	// forever, so it is terminal. This check sits after the replay guards
	// because Solana surfaces a landed failure's error text verbatim, and a
	// transaction that failed with "already in use" is proof a *previous*
	// transaction landed — the replay guard, not a terminal failure. Reading
	// it as terminal would unwind a mint that actually happened.
	if errors.Is(err, ErrTxFailedOnChain) {
		return ClassTerminal
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
