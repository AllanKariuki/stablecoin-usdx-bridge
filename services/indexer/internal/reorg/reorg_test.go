package reorg

import (
	"errors"
	"testing"
)

// chain is a fabricated fork: `stored` is what the indexer recorded, `live`
// is what the chain says now. Every case below is a shape a real chain can
// produce; the point of the package being pure is that all of them are
// reachable in a unit test instead of only against an anvil with evm_revert.
type chain struct {
	stored map[uint64]string
	live   map[uint64]Header
}

func (c chain) known(h uint64) (string, bool) {
	v, ok := c.stored[h]
	return v, ok
}

func (c chain) fetch(h uint64) (Header, error) {
	v, ok := c.live[h]
	if !ok {
		return Header{}, errors.New("no such block")
	}
	return v, nil
}

// linear builds a canonical run 1..n where block i has hash prefix+i and
// parent prefix+(i-1).
func linear(prefix string, from, to uint64) map[uint64]Header {
	out := map[uint64]Header{}
	for h := from; h <= to; h++ {
		out[h] = Header{Height: h, Hash: hashAt(prefix, h), ParentHash: hashAt(prefix, h-1)}
	}
	return out
}

func hashAt(prefix string, h uint64) string {
	return prefix + "-" + itoa(h)
}

func itoa(v uint64) string {
	if v == 0 {
		return "0"
	}
	var b []byte
	for v > 0 {
		b = append([]byte{byte('0' + v%10)}, b...)
		v /= 10
	}
	return string(b)
}

func TestCheckExtendsWithoutAFork(t *testing.T) {
	c := chain{
		stored: map[uint64]string{9: hashAt("a", 9), 10: hashAt("a", 10)},
		live:   linear("a", 1, 12),
	}
	incoming := c.live[11]

	got, err := Check(c.known, c.fetch, incoming, 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Fork {
		t.Fatalf("a block that extends the stored chain was reported as a fork: %+v", got)
	}
	if got.Ancestor != 10 {
		t.Fatalf("ancestor = %d, want 10", got.Ancestor)
	}
}

// The shallowest real reorg: one block replaced. This is what an `evm_revert`
// of a single block on anvil produces, and what Ethereum does routinely at the
// tip.
func TestCheckDetectsOneBlockReorg(t *testing.T) {
	c := chain{
		stored: map[uint64]string{8: hashAt("a", 8), 9: hashAt("a", 9), 10: hashAt("a", 10)},
		live: map[uint64]Header{
			8:  {Height: 8, Hash: hashAt("a", 8), ParentHash: hashAt("a", 7)},
			9:  {Height: 9, Hash: hashAt("a", 9), ParentHash: hashAt("a", 8)},
			10: {Height: 10, Hash: hashAt("b", 10), ParentHash: hashAt("a", 9)},
			11: {Height: 11, Hash: hashAt("b", 11), ParentHash: hashAt("b", 10)},
		},
	}

	got, err := Check(c.known, c.fetch, c.live[11], 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Fork {
		t.Fatal("a replaced block 10 was not reported as a fork")
	}
	if got.Ancestor != 9 {
		t.Fatalf("ancestor = %d, want 9 (the last height both agree on)", got.Ancestor)
	}
	// Depth counts what is being un-believed: block 10 only.
	if got.Depth != 1 {
		t.Fatalf("depth = %d, want 1", got.Depth)
	}
}

func TestCheckDetectsMultiBlockReorg(t *testing.T) {
	c := chain{
		stored: map[uint64]string{
			6: hashAt("a", 6), 7: hashAt("a", 7), 8: hashAt("a", 8),
			9: hashAt("a", 9), 10: hashAt("a", 10),
		},
		live: map[uint64]Header{
			6:  {Height: 6, Hash: hashAt("a", 6), ParentHash: hashAt("a", 5)},
			7:  {Height: 7, Hash: hashAt("a", 7), ParentHash: hashAt("a", 6)},
			8:  {Height: 8, Hash: hashAt("b", 8), ParentHash: hashAt("a", 7)},
			9:  {Height: 9, Hash: hashAt("b", 9), ParentHash: hashAt("b", 8)},
			10: {Height: 10, Hash: hashAt("b", 10), ParentHash: hashAt("b", 9)},
			11: {Height: 11, Hash: hashAt("b", 11), ParentHash: hashAt("b", 10)},
		},
	}

	got, err := Check(c.known, c.fetch, c.live[11], 5)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !got.Fork || got.Ancestor != 7 {
		t.Fatalf("got %+v, want a fork with ancestor 7", got)
	}
	if got.Depth != 3 { // blocks 8, 9, 10
		t.Fatalf("depth = %d, want 3", got.Depth)
	}
}

// A fork older than anything we stored must not be guessed at. Absorbing it
// silently would mean rewriting history the platform has already minted
// against, which is the difference between a correction and a fabrication.
func TestCheckRefusesADeepReorg(t *testing.T) {
	c := chain{
		stored: map[uint64]string{9: hashAt("a", 9), 10: hashAt("a", 10)},
		live: map[uint64]Header{
			9:  {Height: 9, Hash: hashAt("b", 9), ParentHash: hashAt("b", 8)},
			10: {Height: 10, Hash: hashAt("b", 10), ParentHash: hashAt("b", 9)},
			11: {Height: 11, Hash: hashAt("b", 11), ParentHash: hashAt("b", 10)},
		},
	}

	_, err := Check(c.known, c.fetch, c.live[11], 8)
	if !errors.Is(err, ErrDeepReorg) {
		t.Fatalf("err = %v, want ErrDeepReorg", err)
	}
}

// Catching up across a range we never stored is a gap, not a fork. Treating it
// as one would make every cold start look like a chain reorganisation.
func TestCheckTreatsAMissingParentAsAGapNotAFork(t *testing.T) {
	c := chain{stored: map[uint64]string{}, live: linear("a", 1, 12)}

	got, err := Check(c.known, c.fetch, c.live[11], 0)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.Fork {
		t.Fatalf("a cold start was reported as a fork: %+v", got)
	}
}

func TestFloorDoesNotUnderflow(t *testing.T) {
	// head < depth is the ordinary state of a fresh local chain. Unsigned
	// arithmetic below zero would produce a floor near 1.8e19 and make every
	// fork look shallow enough to absorb.
	if got := Floor(3, 128); got != 0 {
		t.Fatalf("Floor(3, 128) = %d, want 0", got)
	}
	if got := Floor(1000, 128); got != 872 {
		t.Fatalf("Floor(1000, 128) = %d, want 872", got)
	}
}
