// Package outbox_test is an external test package so it can import
// internal/ledger (which owns the migrations) even though internal/ledger
// itself imports internal/outbox.
package outbox_test

import (
	"context"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/ledger"
	"github.com/AllanKariuki/stablecoin-usdx-bridge/core-ledger/internal/outbox"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// These run against a real PostgreSQL instance because the thing under test
// is a Postgres locking guarantee. FOR UPDATE SKIP LOCKED has no meaningful
// fake: a stub would either serialise the claimers (proving nothing) or hand
// out rows from a Go map (testing the map).
//
//	docker compose up -d postgres
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge?sslmode=disable' \
//	  go test ./internal/outbox -run TestConcurrentClaim -race -count=10

// One connection pool for the whole test binary. Each Repository and each
// gorm.Open carries its own pool, so building them per test exhausts
// Postgres's max_connections long before the assertions get interesting —
// especially under the -race -count=10 the phase's verify step runs.
var (
	once     sync.Once
	sharedDB *gorm.DB
	sharedSt *outbox.Store
	sharedEr error
)

func testDB(t *testing.T) (*gorm.DB, *outbox.Store, context.Context) {
	t.Helper()
	dsn := os.Getenv("LEDGER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set LEDGER_TEST_DATABASE_URL to run outbox integration tests")
	}

	once.Do(func() {
		// NewRepository is what runs the migrations, so the table under test
		// exists in the same shape production gets.
		repo, err := ledger.NewRepository(dsn)
		if err != nil {
			sharedEr = err
			return
		}
		sharedSt = repo.OutboxStore()
		sharedDB, sharedEr = gorm.Open(postgres.Open(dsn), &gorm.Config{Logger: logger.Discard})
	})
	if sharedEr != nil {
		t.Fatalf("connecting: %v", sharedEr)
	}
	return sharedDB, sharedSt, context.Background()
}

// runID keeps concurrent runs (-count=10) from claiming each other's events.
func runID(t *testing.T) string {
	t.Helper()
	return t.Name() + ":" + time.Now().UTC().Format("20060102150405.000000000")
}

func seedEvents(t *testing.T, db *gorm.DB, aggregate string, n int) {
	t.Helper()
	for i := 0; i < n; i++ {
		e := &outbox.Event{
			EventType:     "damp.test.event.v1",
			AggregateType: "TEST",
			AggregateID:   aggregate,
			Payload:       fmt.Sprintf(`{"n":%d}`, i),
		}
		if err := outbox.Enqueue(db, e); err != nil {
			t.Fatalf("seeding event %d: %v", i, err)
		}
	}
}

// TestConcurrentClaim is the guarantee N relay replicas rest on: every event
// is handed to exactly one claimer. A duplicate here is a duplicate delivery
// in production, and for an event stream that drives compliance screening and
// customer notifications, "delivered twice" is a visible defect.
func TestConcurrentClaim(t *testing.T) {
	db, store, ctx := testDB(t)

	const (
		events   = 200
		claimers = 8
		batch    = 7 // deliberately not a divisor of 200: partial batches too
	)
	aggregate := runID(t)
	seedEvents(t, db, aggregate, events)

	var mu sync.Mutex
	seen := map[int64]int{}
	mine := 0

	var wg sync.WaitGroup
	for i := 0; i < claimers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				claimed, err := store.Claim(ctx, batch, time.Minute)
				if err != nil {
					t.Errorf("claiming: %v", err)
					return
				}
				if len(claimed) == 0 {
					return
				}
				mu.Lock()
				for _, e := range claimed {
					seen[e.ID]++
					if e.AggregateID == aggregate {
						mine++
					}
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	for id, times := range seen {
		if times > 1 {
			t.Fatalf("event %d was claimed %d times; SKIP LOCKED is not isolating claimers", id, times)
		}
	}
	if mine != events {
		t.Fatalf("claimed %d of this run's %d events; some were never handed out", mine, events)
	}
}

// TestClaimHidesForVisibility proves the second half of the guarantee: a
// claimed event stays invisible while its claimer works on it, so a relay that
// is slow (rather than dead) doesn't have its work published a second time by
// a peer.
func TestClaimHidesForVisibility(t *testing.T) {
	db, store, ctx := testDB(t)

	aggregate := runID(t)
	seedEvents(t, db, aggregate, 3)

	first, err := store.Claim(ctx, 10, time.Minute)
	if err != nil {
		t.Fatalf("first claim: %v", err)
	}
	if len(first) == 0 {
		t.Fatal("first claim returned nothing")
	}

	second, err := store.Claim(ctx, 10, time.Minute)
	if err != nil {
		t.Fatalf("second claim: %v", err)
	}
	for _, e := range second {
		for _, f := range first {
			if e.ID == f.ID {
				t.Fatalf("event %d was claimed twice inside its visibility window", e.ID)
			}
		}
	}

	// Attempts is post-increment, so a freshly claimed event reads 1 — which
	// is what the relay's budget check relies on.
	if first[0].Attempts != 1 {
		t.Fatalf("attempts = %d after one claim, want 1", first[0].Attempts)
	}
}

// TestPublishedEventsAreNotReclaimed closes the loop: once marked published,
// an event never comes back.
func TestPublishedEventsAreNotReclaimed(t *testing.T) {
	db, store, ctx := testDB(t)

	aggregate := runID(t)
	seedEvents(t, db, aggregate, 2)

	claimed, err := store.Claim(ctx, 10, time.Second)
	if err != nil {
		t.Fatalf("claim: %v", err)
	}
	ids := make([]int64, 0, len(claimed))
	for _, e := range claimed {
		ids = append(ids, e.ID)
	}
	if err := store.MarkPublished(ctx, ids); err != nil {
		t.Fatalf("marking published: %v", err)
	}

	// Past the visibility window, so anything still PENDING would resurface.
	time.Sleep(1500 * time.Millisecond)

	again, err := store.Claim(ctx, 10, time.Second)
	if err != nil {
		t.Fatalf("re-claim: %v", err)
	}
	for _, e := range again {
		for _, id := range ids {
			if e.ID == id {
				t.Fatalf("published event %d was claimed again", id)
			}
		}
	}
}
