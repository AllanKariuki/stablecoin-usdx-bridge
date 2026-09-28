package tailer

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"math/big"
	"sort"
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/reorg"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/indexer/internal/store"
)

// ---------------------------------------------------------------------------
// A chain and a database, both in memory.
//
// R9 ("a reorged mint leaves an unbacked ledger balance") is the risk this
// loop exists to close, and the only honest way to test it is to be able to
// rewrite the chain underneath it. Doing that against anvil needs a running
// node and an evm_revert; doing it here needs a map.
// ---------------------------------------------------------------------------

type fakeChain struct {
	head    uint64
	headers map[uint64]reorg.Header
	events  map[uint64][]store.Event
	supply  *big.Int

	headerCalls int
}

func (f *fakeChain) Chain() string { return "ETHEREUM" }

func (f *fakeChain) Head(context.Context) (uint64, error) { return f.head, nil }

func (f *fakeChain) HeaderAt(_ context.Context, h uint64) (reorg.Header, error) {
	f.headerCalls++
	hdr, ok := f.headers[h]
	if !ok {
		return reorg.Header{}, fmt.Errorf("no block at %d", h)
	}
	return hdr, nil
}

func (f *fakeChain) Events(_ context.Context, from, to uint64) ([]store.Event, error) {
	var out []store.Event
	for h := from; h <= to; h++ {
		out = append(out, f.events[h]...)
	}
	return out, nil
}

func (f *fakeChain) TotalSupply(context.Context) (*big.Int, uint64, error) {
	return f.supply, f.head, nil
}

// reshape replaces the chain from `at` upwards with a different one — exactly
// what a reorg is.
func (f *fakeChain) reshape(prefix string, at, to uint64) {
	for h := at; h <= to; h++ {
		parent := f.headers[h-1].Hash
		if h > at {
			parent = fmt.Sprintf("%s-%d", prefix, h-1)
		}
		f.headers[h] = reorg.Header{Height: h, Hash: fmt.Sprintf("%s-%d", prefix, h), ParentHash: parent}
		delete(f.events, h)
	}
	f.head = to
}

type fakeRecords struct {
	cursor       uint64
	cursorHash   string
	blocks       map[uint64]string // canonical hash by height
	events       map[string]store.Event
	orphanedAt   []uint64
	orphanedRows int64
}

func newFakeRecords() *fakeRecords {
	return &fakeRecords{blocks: map[uint64]string{}, events: map[string]store.Event{}}
}

func (r *fakeRecords) Cursor(context.Context, string) (uint64, string, error) {
	return r.cursor, r.cursorHash, nil
}

func (r *fakeRecords) SetCursor(_ context.Context, _ string, height uint64, hash string) error {
	r.cursor, r.cursorHash = height, hash
	return nil
}

func (r *fakeRecords) CanonicalHashAt(_ context.Context, _ string, height uint64) (string, bool, error) {
	h, ok := r.blocks[height]
	return h, ok, nil
}

func (r *fakeRecords) Orphan(_ context.Context, _ string, above uint64) (int64, int64, error) {
	r.orphanedAt = append(r.orphanedAt, above)
	var blocks, events int64
	for h := range r.blocks {
		if h > above {
			delete(r.blocks, h)
			blocks++
		}
	}
	for id, e := range r.events {
		if e.BlockHeight > above {
			delete(r.events, id)
			events++
		}
	}
	r.orphanedRows += events
	return blocks, events, nil
}

func (r *fakeRecords) PutEvents(_ context.Context, events []store.Event) error {
	for _, e := range events {
		r.events[e.ID] = e
	}
	return nil
}

func (r *fakeRecords) PutBlock(_ context.Context, b store.Block) error {
	r.blocks[b.Height] = b.Hash
	return nil
}

func (r *fakeRecords) PruneBlocks(_ context.Context, _ string, below uint64) error {
	for h := range r.blocks {
		if h < below {
			delete(r.blocks, h)
		}
	}
	return nil
}

func (r *fakeRecords) eventIDs() []string {
	out := make([]string, 0, len(r.events))
	for id := range r.events {
		out = append(out, id)
	}
	sort.Strings(out)
	return out
}

// ---------------------------------------------------------------------------

func newChain(prefix string, to uint64) *fakeChain {
	c := &fakeChain{
		head:    to,
		headers: map[uint64]reorg.Header{},
		events:  map[uint64][]store.Event{},
		supply:  big.NewInt(0),
	}
	for h := uint64(1); h <= to; h++ {
		c.headers[h] = reorg.Header{
			Height:     h,
			Hash:       fmt.Sprintf("%s-%d", prefix, h),
			ParentHash: fmt.Sprintf("%s-%d", prefix, h-1),
		}
	}
	return c
}

func mint(height uint64, id string) store.Event {
	return store.Event{
		ID: id, Chain: "ETHEREUM", EventType: "BridgeMinted",
		BlockHeight: height, TxHash: id, Payload: map[string]any{"amount": "250000000"},
	}
}

func newTailer(c *fakeChain, r *fakeRecords, cfg Config) *Tailer {
	return New(c, r, slog.New(slog.NewTextHandler(io.Discard, nil)), NopObserver{}, cfg)
}

func testConfig() Config {
	return Config{Confirmations: 2, ReorgDepth: 20, BatchSize: 100, StartHeight: 1}
}

func TestOnceIndexesUpToTheSafeHead(t *testing.T) {
	chain := newChain("a", 10)
	chain.events[5] = []store.Event{mint(5, "tx-5")}
	records := newFakeRecords()

	if err := newTailer(chain, records, testConfig()).Once(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// head 10, confirmations 2 → nothing above 8 is settled.
	if records.cursor != 8 {
		t.Fatalf("cursor = %d, want 8 (head 10 minus 2 confirmations)", records.cursor)
	}
	if len(records.events) != 1 {
		t.Fatalf("recorded %d events, want 1", len(records.events))
	}
}

// Nothing within the confirmation depth may be recorded. This is what makes a
// routine tip reorg invisible to consumers instead of a correction every one
// of them has to handle.
func TestOnceStaysBehindTheConfirmationDepth(t *testing.T) {
	chain := newChain("a", 10)
	chain.events[9] = []store.Event{mint(9, "tx-9")}    // 1 confirmation
	chain.events[10] = []store.Event{mint(10, "tx-10")} // 0 confirmations
	records := newFakeRecords()

	if err := newTailer(chain, records, testConfig()).Once(context.Background()); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(records.events) != 0 {
		t.Fatalf("recorded %v, want nothing: both events are inside the confirmation depth", records.eventIDs())
	}
}

// The core of R9. A mint is indexed, the chain then replaces the block that
// contained it, and the indexer must un-believe the mint rather than leave a
// ledger balance backed by a transaction that no longer exists.
func TestOnceOrphansAReorgedMint(t *testing.T) {
	chain := newChain("a", 10)
	chain.events[7] = []store.Event{mint(7, "tx-7")}
	records := newFakeRecords()
	tl := newTailer(chain, records, testConfig())

	if err := tl.Once(context.Background()); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	if _, ok := records.events["tx-7"]; !ok {
		t.Fatal("the mint at block 7 was never indexed, so there is nothing for the reorg to take back")
	}

	// The chain reorganises from block 7 and the mint is not on the new fork.
	chain.reshape("b", 7, 14)

	if err := tl.Once(context.Background()); err != nil {
		t.Fatalf("second pass: %v", err)
	}

	if _, ok := records.events["tx-7"]; ok {
		t.Fatal("the mint survived a reorg that removed the block containing it")
	}
	if len(records.orphanedAt) != 1 || records.orphanedAt[0] != 6 {
		t.Fatalf("orphaned above %v, want [6] (the last height both chains agree on)", records.orphanedAt)
	}
	if records.orphanedRows == 0 {
		t.Fatal("the reorg reported no orphaned events")
	}
}

// A reorg that keeps a transaction — the same mint, in a different block —
// must end with the event present and pointing at the new block. Orphaning
// without re-reading would leave a real mint invisible, which is the opposite
// failure and just as bad.
func TestOnceReindexesASurvivingMintAfterAReorg(t *testing.T) {
	chain := newChain("a", 10)
	chain.events[7] = []store.Event{mint(7, "tx-7")}
	records := newFakeRecords()
	tl := newTailer(chain, records, testConfig())

	if err := tl.Once(context.Background()); err != nil {
		t.Fatalf("first pass: %v", err)
	}

	chain.reshape("b", 7, 14)
	// The transaction was re-included one block later on the new fork.
	chain.events[8] = []store.Event{mint(8, "tx-7")}

	if err := tl.Once(context.Background()); err != nil {
		t.Fatalf("second pass: %v", err)
	}

	got, ok := records.events["tx-7"]
	if !ok {
		t.Fatal("a mint that was re-included on the new fork is missing from the index")
	}
	if got.BlockHeight != 8 {
		t.Fatalf("the re-included mint is recorded at block %d, want 8", got.BlockHeight)
	}
}

// A cursor must not go backwards on its own. Only a fork may rewind it, and
// this asserts the ordinary path doesn't.
func TestOnceIsIdempotentWhenNothingNewHasSettled(t *testing.T) {
	chain := newChain("a", 10)
	records := newFakeRecords()
	tl := newTailer(chain, records, testConfig())

	if err := tl.Once(context.Background()); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	first := records.cursor

	for i := 0; i < 3; i++ {
		if err := tl.Once(context.Background()); err != nil {
			t.Fatalf("repeat pass %d: %v", i, err)
		}
		if records.cursor != first {
			t.Fatalf("cursor moved to %d on a pass with nothing new; want it to stay at %d", records.cursor, first)
		}
	}
}

// A fork older than the stored header window must stop the tailer rather than
// rewrite history the platform has already minted against.
func TestOnceRefusesADeepReorg(t *testing.T) {
	chain := newChain("a", 40)
	records := newFakeRecords()
	cfg := testConfig()
	cfg.ReorgDepth = 5

	tl := newTailer(chain, records, cfg)
	if err := tl.Once(context.Background()); err != nil {
		t.Fatalf("first pass: %v", err)
	}
	before := records.cursor

	// Replace far more than the stored window.
	chain.reshape("b", 10, 44)

	err := tl.Once(context.Background())
	if err == nil {
		t.Fatal("a reorg deeper than the stored window was absorbed silently")
	}
	if records.cursor != before {
		t.Fatalf("the cursor moved to %d despite an unresolvable reorg; want it parked at %d", records.cursor, before)
	}
}
