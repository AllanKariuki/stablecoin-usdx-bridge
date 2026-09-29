// Package chain is the audit trail's two integrity mechanisms: a hash chain
// over every event, and a Merkle root published periodically.
//
// They answer different questions, which is why both exist.
//
// The **hash chain** answers "has anything been removed or altered?", and it
// answers it to anyone who can read the table — no trust in the process that
// wrote the rows. What it cannot do is prove *when* a row was written: an
// attacker who controls the database can rewrite the whole chain from any
// point and produce a consistent-looking log.
//
// The **Merkle root**, published somewhere the platform does not control,
// answers that. Once a root covering hours 0–N is on a public chain, no
// rewrite of those hours can produce that root — and the inclusion proof for
// any single event in that window is ~log₂(n) hashes, which is what makes
// publishing a 32-byte root as good as publishing everything.
//
// Everything here is pure functions over byte slices. That is not a style
// preference: the value of an audit trail is that somebody can verify it
// independently, and a verifier that needs this platform's database running
// is not independent.
package chain

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
)

// leafPrefix and nodePrefix are RFC 6962's domain separators.
//
// Without them a Merkle tree is vulnerable to second-preimage attacks: an
// internal node's hash is the hash of two concatenated 32-byte values, and an
// attacker who can choose a *leaf* can submit those 64 bytes as a leaf and
// produce the same root from a different tree. Prefixing leaves with 0x00 and
// internal nodes with 0x01 makes the two domains disjoint, so no leaf can
// ever collide with a node.
const (
	leafPrefix = 0x00
	nodePrefix = 0x01
)

// HashLeaf hashes one event's canonical bytes into a tree leaf.
func HashLeaf(data []byte) [32]byte {
	h := sha256.New()
	h.Write([]byte{leafPrefix})
	h.Write(data)
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

func hashNode(left, right [32]byte) [32]byte {
	h := sha256.New()
	h.Write([]byte{nodePrefix})
	h.Write(left[:])
	h.Write(right[:])
	var out [32]byte
	copy(out[:], h.Sum(nil))
	return out
}

// Root builds a Merkle root over an ordered set of leaves.
//
// An odd node at a level is **promoted**, not duplicated. Duplicating it —
// the common shortcut, and Bitcoin's — makes a tree with an odd last leaf
// produce the same root as one where that leaf genuinely appears twice
// (CVE-2012-2459). For an audit trail that would mean two different histories
// with one anchor, which is the exact property the anchor exists to rule out.
func Root(leaves [][32]byte) [32]byte {
	if len(leaves) == 0 {
		// The empty tree is the hash of nothing, not a zero value: a zero root
		// would be indistinguishable from an uninitialised field, and an
		// anchor claiming to cover zero events should still be a specific,
		// checkable value.
		return sha256.Sum256(nil)
	}

	level := make([][32]byte, len(leaves))
	copy(level, leaves)

	for len(level) > 1 {
		next := make([][32]byte, 0, (len(level)+1)/2)
		for i := 0; i+1 < len(level); i += 2 {
			next = append(next, hashNode(level[i], level[i+1]))
		}
		if len(level)%2 == 1 {
			next = append(next, level[len(level)-1])
		}
		level = next
	}
	return level[0]
}

// ProofStep is one sibling on the path from a leaf to the root.
type ProofStep struct {
	Hash [32]byte
	// IsLeft says which side the sibling sits on. Getting it wrong produces a
	// different root, so it is carried explicitly rather than inferred from
	// an index the verifier would have to trust.
	IsLeft bool
}

var ErrIndexOutOfRange = errors.New("leaf index is outside the tree")

// Proof builds the inclusion proof for one leaf.
//
// The proof is what makes publishing a single 32-byte root as good as
// publishing every event: a holder of one event can show it was in the
// anchored set with ~log₂(n) hashes and no access to the rest of the log —
// which matters, because the rest of the log is other customers' activity.
func Proof(leaves [][32]byte, index int) ([]ProofStep, error) {
	if index < 0 || index >= len(leaves) {
		return nil, ErrIndexOutOfRange
	}

	var steps []ProofStep
	level := make([][32]byte, len(leaves))
	copy(level, leaves)
	position := index

	for len(level) > 1 {
		next := make([][32]byte, 0, (len(level)+1)/2)
		for i := 0; i+1 < len(level); i += 2 {
			if position == i {
				steps = append(steps, ProofStep{Hash: level[i+1], IsLeft: false})
			} else if position == i+1 {
				steps = append(steps, ProofStep{Hash: level[i], IsLeft: true})
			}
			next = append(next, hashNode(level[i], level[i+1]))
		}

		if len(level)%2 == 1 {
			// The promoted node has no sibling at this level, so it
			// contributes no proof step — the position simply moves up.
			next = append(next, level[len(level)-1])
		}

		position /= 2
		level = next
	}
	return steps, nil
}

// Verify recomputes a root from a leaf and its proof.
//
// This is the function an external auditor runs, which is why it takes only
// bytes: a verifier that needed this platform's database running would not be
// independent of it.
func Verify(leaf [32]byte, steps []ProofStep, root [32]byte) bool {
	current := leaf
	for _, step := range steps {
		if step.IsLeft {
			current = hashNode(step.Hash, current)
		} else {
			current = hashNode(current, step.Hash)
		}
	}
	return current == root
}

func Hex(h [32]byte) string { return hex.EncodeToString(h[:]) }

func FromHex(s string) ([32]byte, error) {
	var out [32]byte
	raw, err := hex.DecodeString(s)
	if err != nil {
		return out, err
	}
	if len(raw) != 32 {
		return out, errors.New("a hash is 32 bytes")
	}
	copy(out[:], raw)
	return out, nil
}
