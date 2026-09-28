// Package reorg answers one question: given what we recorded and what the
// chain now says, how far back do we have to un-believe?
//
// It is a package of pure functions over hashes and heights, with no database
// and no RPC client, because R9 in the risk register ("a reorged mint leaves
// an unbacked ledger balance") is the kind of defect that is trivially
// testable and catastrophically expensive, and the only way to test it is to
// be able to hand the logic a fabricated fork.
package reorg

import (
	"errors"
	"fmt"
)

// Header is the minimum a chain has to tell us for a fork to be detectable:
// where a block sits, what it is, and what it claims to follow.
type Header struct {
	Height     uint64
	Hash       string
	ParentHash string
}

// Known reports the hash we previously recorded as canonical at a height.
// Missing heights return ok=false — the indexer has a finite memory (see
// Config.ReorgDepth) and a fork deeper than that is not something it can
// resolve by itself.
type Known func(height uint64) (hash string, ok bool)

// Fetch returns the chain's *current* header at a height.
type Fetch func(height uint64) (Header, error)

// ErrDeepReorg means the fork is older than the indexer's stored window. It
// is deliberately an error rather than a "rewind everything": a reorg deeper
// than the confirmation depth the platform mints on is not a routine event to
// be absorbed silently, it is an incident, and the correct response is to stop
// and page someone rather than to quietly rewrite a week of history.
var ErrDeepReorg = errors.New("reorg is deeper than the indexer's stored block window")

// Decision is what the caller should do with an incoming header.
type Decision struct {
	// Fork is true when the incoming header does not extend what we recorded.
	Fork bool

	// Ancestor is the highest height at which our record and the chain still
	// agree. Everything strictly above it is orphaned. When Fork is false it
	// is the incoming header's parent height.
	Ancestor uint64

	// Depth is how many blocks are being un-believed. 0 when Fork is false.
	Depth uint64
}

// Check compares one incoming header against what we know.
//
// The common case is one comparison and no I/O: the incoming block's parent is
// the hash we stored at height-1, so the chain extends what we have and there
// is nothing to do. Only a mismatch walks backwards, and only as far as the
// first agreement.
//
// floor is the oldest height the caller still has records for. Walking below
// it returns ErrDeepReorg rather than a bad answer.
func Check(known Known, fetch Fetch, incoming Header, floor uint64) (Decision, error) {
	// Genesis, or the very first block this indexer ever saw: there is nothing
	// to contradict.
	if incoming.Height == 0 || incoming.Height <= floor {
		return Decision{Ancestor: incoming.Height}, nil
	}

	parentHeight := incoming.Height - 1
	storedParent, ok := known(parentHeight)
	if !ok {
		// A gap rather than a fork — the indexer is starting fresh, or
		// catching up across a range it never stored. Nothing to un-believe.
		return Decision{Ancestor: parentHeight}, nil
	}
	if storedParent == incoming.ParentHash {
		return Decision{Ancestor: parentHeight}, nil
	}

	// The chain disagrees with us at height-1. Walk back until it doesn't.
	for h := parentHeight; h > floor; h-- {
		stored, ok := known(h)
		if !ok {
			// Ran out of memory before finding agreement.
			return Decision{}, fmt.Errorf("%w: no stored block at height %d", ErrDeepReorg, h)
		}
		current, err := fetch(h)
		if err != nil {
			return Decision{}, fmt.Errorf("fetching header at %d while resolving a fork: %w", h, err)
		}
		if current.Hash == stored {
			return Decision{Fork: true, Ancestor: h, Depth: incoming.Height - h - 1}, nil
		}
	}

	return Decision{}, fmt.Errorf("%w: walked back to floor %d without agreement", ErrDeepReorg, floor)
}

// Floor is the oldest height worth keeping headers for: deep enough that any
// reorg the platform is willing to absorb is inside it, and bounded so the
// table does not become a second copy of the chain.
//
// Returning 0 rather than underflowing matters — uint64 arithmetic below zero
// produces a floor of ~1.8e19, which would make every fork look shallow.
func Floor(head, depth uint64) uint64 {
	if head <= depth {
		return 0
	}
	return head - depth
}
