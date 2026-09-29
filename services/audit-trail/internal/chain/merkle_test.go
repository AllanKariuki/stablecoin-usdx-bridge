package chain

import (
	"crypto/sha256"
	"fmt"
	"testing"
)

func leaves(n int) [][32]byte {
	out := make([][32]byte, n)
	for i := range out {
		out[i] = HashLeaf([]byte(fmt.Sprintf("event-%d", i)))
	}
	return out
}

// Every leaf in a tree of every size up to 33 must prove. The sizes that
// matter are the odd ones and the non-powers-of-two, because that is where
// the promoted-node path runs — and an audit trail's tree is whatever size
// the hour happened to be, never a convenient power of two.
func TestEveryLeafProvesForEveryTreeSize(t *testing.T) {
	for n := 1; n <= 33; n++ {
		set := leaves(n)
		root := Root(set)
		for i := 0; i < n; i++ {
			proof, err := Proof(set, i)
			if err != nil {
				t.Fatalf("n=%d i=%d: %v", n, i, err)
			}
			if !Verify(set[i], proof, root) {
				t.Fatalf("n=%d: leaf %d did not verify against the root", n, i)
			}
		}
	}
}

// The property the anchor exists for: no rewrite of an anchored window can
// produce the same root.
func TestChangingAnyLeafChangesTheRoot(t *testing.T) {
	set := leaves(9)
	original := Root(set)

	for i := range set {
		tampered := make([][32]byte, len(set))
		copy(tampered, set)
		tampered[i] = HashLeaf([]byte("forged"))
		if Root(tampered) == original {
			t.Fatalf("altering leaf %d left the root unchanged", i)
		}
	}
}

func TestRemovingALeafChangesTheRoot(t *testing.T) {
	set := leaves(9)
	if Root(set[:8]) == Root(set) {
		t.Fatal("removing the last leaf left the root unchanged")
	}
}

func TestReorderingLeavesChangesTheRoot(t *testing.T) {
	// Order is meaning in an audit trail: "approved then paid" and "paid then
	// approved" are different histories.
	set := leaves(4)
	swapped := [][32]byte{set[1], set[0], set[2], set[3]}
	if Root(swapped) == Root(set) {
		t.Fatal("swapping two leaves left the root unchanged")
	}
}

// CVE-2012-2459. Duplicating an odd last node — the common shortcut, and
// Bitcoin's — makes a tree of n leaves collide with one where the last leaf
// genuinely appears twice. For an audit trail that would mean two different
// histories under one anchor, which is the exact property the anchor rules
// out.
func TestAnOddTreeDoesNotCollideWithItsDuplicatedForm(t *testing.T) {
	set := leaves(3)
	duplicated := append(append([][32]byte{}, set...), set[2])

	if Root(set) == Root(duplicated) {
		t.Fatal("a 3-leaf tree hashed to the same root as a 4-leaf tree with the last leaf duplicated")
	}
}

// RFC 6962's domain separation. Without it an internal node's preimage (64
// bytes of two hashes) could be submitted as a *leaf*, producing the same
// root from a different tree.
func TestLeafAndNodeHashingAreDisjoint(t *testing.T) {
	a := HashLeaf([]byte("a"))
	b := HashLeaf([]byte("b"))
	internal := Root([][32]byte{a, b})

	// The 64 bytes an attacker would submit as a leaf to impersonate that
	// internal node.
	forged := HashLeaf(append(a[:], b[:]...))
	if forged == internal {
		t.Fatal("a leaf hashed to the same value as an internal node; the domain separators are missing")
	}
}

func TestSingleLeafTreeRootsToTheLeaf(t *testing.T) {
	set := leaves(1)
	if Root(set) != set[0] {
		t.Fatal("a one-leaf tree must root to that leaf")
	}
	proof, err := Proof(set, 0)
	if err != nil {
		t.Fatalf("proving: %v", err)
	}
	if len(proof) != 0 {
		t.Fatalf("a one-leaf proof needs %d steps, want 0", len(proof))
	}
}

func TestEmptyTreeHasASpecificRoot(t *testing.T) {
	// Not a zero value: a zero root is indistinguishable from an
	// uninitialised field, and an anchor covering zero events should still be
	// a specific, checkable value.
	if Root(nil) != sha256.Sum256(nil) {
		t.Fatal("the empty tree's root is not the hash of nothing")
	}
	var zero [32]byte
	if Root(nil) == zero {
		t.Fatal("the empty tree rooted to a zero value")
	}
}

func TestProofRejectsAnOutOfRangeIndex(t *testing.T) {
	set := leaves(4)
	for _, index := range []int{-1, 4, 99} {
		if _, err := Proof(set, index); err != ErrIndexOutOfRange {
			t.Fatalf("index %d: err = %v, want ErrIndexOutOfRange", index, err)
		}
	}
}

// A proof for one leaf must not verify another. Otherwise an anchor proves
// only that *something* was in the set.
func TestAProofDoesNotVerifyADifferentLeaf(t *testing.T) {
	set := leaves(8)
	root := Root(set)
	proof, err := Proof(set, 3)
	if err != nil {
		t.Fatalf("proving: %v", err)
	}
	if Verify(set[4], proof, root) {
		t.Fatal("leaf 3's proof verified leaf 4")
	}
}

func TestATamperedProofStepFails(t *testing.T) {
	set := leaves(8)
	root := Root(set)
	proof, err := Proof(set, 2)
	if err != nil {
		t.Fatalf("proving: %v", err)
	}

	// Flipping a sibling's side is the subtle tampering: the hashes are all
	// genuine, only the order changed.
	proof[0].IsLeft = !proof[0].IsLeft
	if Verify(set[2], proof, root) {
		t.Fatal("a proof with a flipped sibling side still verified")
	}
}

func TestProofLengthIsLogarithmic(t *testing.T) {
	// What makes publishing a 32-byte root as good as publishing everything:
	// a holder of one event proves inclusion in ~log2(n) hashes, without
	// access to the rest of the log — which matters, because the rest of the
	// log is other customers' activity.
	set := leaves(1024)
	proof, err := Proof(set, 500)
	if err != nil {
		t.Fatalf("proving: %v", err)
	}
	if len(proof) != 10 {
		t.Fatalf("a proof over 1024 leaves took %d steps, want 10", len(proof))
	}
}

func TestHexRoundTrips(t *testing.T) {
	root := Root(leaves(5))
	decoded, err := FromHex(Hex(root))
	if err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if decoded != root {
		t.Fatal("a root did not survive a hex round trip")
	}
}
