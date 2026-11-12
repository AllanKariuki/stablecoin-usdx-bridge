package store

import (
	"context"
	"errors"
	"os"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"
)

// Real Postgres, in audit_trail_test — never the dev database. The append-only
// trigger, the unique index on id and the SERIALIZABLE tip read are all
// database properties; a fake would confirm the Go and none of them.
//
//	AUDIT_TRAIL_TEST_DATABASE_URL='postgres://audit_trail:audit_trail@localhost:55433/audit_trail_test?sslmode=disable' \
//	  go test ./services/audit-trail/... -race -v
func testStore(t *testing.T) *Store {
	t.Helper()
	dsn := os.Getenv("AUDIT_TRAIL_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set AUDIT_TRAIL_TEST_DATABASE_URL to run audit-trail store integration tests")
	}
	st, err := Open(dsn)
	if err != nil {
		t.Fatalf("opening store: %v", err)
	}
	t.Cleanup(func() { _ = st.Close() })
	return st
}

func newEvent() *Event {
	return &Event{
		ID: uuid.NewString(), Actor: "ops-1", Action: "test.redelivery", Service: "test",
		SubjectType: "THING", SubjectID: "t-1", Outcome: "SUCCESS",
		AfterState: map[string]any{"status": "FROZEN"},
	}
}

func TestIntegrationRedeliveryIsRecordedOnce(t *testing.T) {
	st, ctx := testStore(t), context.Background()

	first := newEvent()
	created, err := st.Append(ctx, first)
	if err != nil || !created {
		t.Fatalf("first Append = %v, %v", created, err)
	}

	again := newEvent()
	again.ID = first.ID
	again.SourceIP = "10.1.1.1" // context, not content: still the same event
	created, err = st.Append(ctx, again)
	if err != nil || created {
		t.Fatalf("redelivery Append = %v, %v; want not created, no error", created, err)
	}
	if again.Seq != first.Seq || again.Hash != first.Hash {
		t.Fatalf("redelivery answered seq %d / %s, want the original %d / %s", again.Seq, again.Hash, first.Seq, first.Hash)
	}

	got, err := st.Events(ctx, Filter{Action: "test.redelivery", SubjectID: "t-1", Limit: 500})
	if err != nil {
		t.Fatal(err)
	}
	n := 0
	for _, e := range got {
		if e.ID == first.ID {
			n++
		}
	}
	if n != 1 {
		t.Fatalf("event recorded %d times, want 1", n)
	}
}

func TestIntegrationADifferentEventUnderAUsedIDIsRefused(t *testing.T) {
	st, ctx := testStore(t), context.Background()
	first := newEvent()
	if _, err := st.Append(ctx, first); err != nil {
		t.Fatal(err)
	}
	forged := newEvent()
	forged.ID, forged.Actor = first.ID, "somebody-else"
	if _, err := st.Append(ctx, forged); !errors.Is(err, ErrIDConflict) {
		t.Fatalf("Append = %v, want ErrIDConflict", err)
	}
}

// Producers' relays race. Ten deliveries of one event at once must still
// leave one row and an unforked chain — the unique index and SERIALIZABLE
// catch the losers, and the retry turns them into "already recorded".
func TestIntegrationConcurrentRedeliveriesStillRecordOnce(t *testing.T) {
	st, ctx := testStore(t), context.Background()
	id := uuid.NewString()

	var wg sync.WaitGroup
	var mu sync.Mutex
	createdCount := 0
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e := newEvent()
			e.ID = id
			created, err := st.Append(ctx, e)
			if err != nil {
				t.Errorf("Append: %v", err)
				return
			}
			if created {
				mu.Lock()
				createdCount++
				mu.Unlock()
			}
		}()
	}
	wg.Wait()
	if createdCount != 1 {
		t.Fatalf("%d deliveries created a row, want exactly 1", createdCount)
	}
	if ok, broken, _, err := st.Verify(ctx); err != nil || !ok {
		t.Fatalf("chain broken at %s after concurrent appends (err %v)", broken, err)
	}
}

// Regression: occurred_at was hashed at nanosecond precision and stored at
// microsecond precision, so the event failed Verify the moment it was read
// back — and audit-trail refuses to boot on a broken chain.
func TestIntegrationSubMicrosecondTimestampsStillVerify(t *testing.T) {
	st, ctx := testStore(t), context.Background()
	e := newEvent()
	e.OccurredAt = time.Date(2026, 11, 12, 9, 30, 0, 123456789, time.UTC)
	if _, err := st.Append(ctx, e); err != nil {
		t.Fatal(err)
	}
	e2 := newEvent() // OccurredAt left zero: Append stamps time.Now()
	if _, err := st.Append(ctx, e2); err != nil {
		t.Fatal(err)
	}
	if ok, broken, _, err := st.Verify(ctx); err != nil || !ok {
		t.Fatalf("chain broken at %s (err %v)", broken, err)
	}
}
