package audit

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"sync"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// These run against real Postgres, because what is under test is a Postgres
// property twice over: that the outbox row commits and rolls back with the
// caller's transaction, and that SKIP LOCKED hands each row to one relay.
//
// Each test gets a throwaway schema in the Go integration database
// (bridge_test, never the dev database), so the table here can't collide with
// the audit_outbox core-ledger's own migrations create there.
//
//	LEDGER_TEST_DATABASE_URL='postgres://bridge:bridge@localhost:55433/bridge_test?sslmode=disable' \
//	  go test ./shared/go/platform/audit -race -v
func testDB(t *testing.T) *sql.DB {
	t.Helper()
	dsn := os.Getenv("LEDGER_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set LEDGER_TEST_DATABASE_URL to run audit outbox integration tests")
	}

	admin, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatal(err)
	}
	schema := fmt.Sprintf("audit_outbox_test_%d", time.Now().UnixNano())
	if _, err := admin.Exec(`CREATE SCHEMA ` + schema); err != nil {
		t.Fatalf("creating schema: %v", err)
	}
	t.Cleanup(func() {
		_, _ = admin.Exec(`DROP SCHEMA ` + schema + ` CASCADE`)
		_ = admin.Close()
	})

	u, err := url.Parse(dsn)
	if err != nil {
		t.Fatal(err)
	}
	q := u.Query()
	q.Set("search_path", schema)
	u.RawQuery = q.Encode()

	db, err := sql.Open("pgx", u.String())
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	if _, err := db.Exec(Schema); err != nil {
		t.Fatalf("applying Schema: %v", err)
	}
	return db
}

func count(t *testing.T, db *sql.DB, where string) int {
	t.Helper()
	var n int
	if err := db.QueryRow(`SELECT count(*) FROM audit_outbox WHERE ` + where).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestIntegrationEnqueueIsTransactional(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	ev := Event{Actor: "ops-1", Action: "test.thing.done", Service: "test"}

	tx, _ := db.BeginTx(ctx, nil)
	if _, err := Enqueue(ctx, tx, ev); err != nil {
		t.Fatal(err)
	}
	_ = tx.Rollback()
	if n := count(t, db, "true"); n != 0 {
		t.Fatalf("a rolled-back action left %d audit events behind", n)
	}

	tx, _ = db.BeginTx(ctx, nil)
	id, err := Enqueue(ctx, tx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if err := tx.Commit(); err != nil {
		t.Fatal(err)
	}
	if n := count(t, db, fmt.Sprintf("event_id = '%s' AND status = 'PENDING'", id)); n != 1 {
		t.Fatalf("committed action has %d pending audit events, want 1", n)
	}
}

func TestIntegrationConcurrentRelaysClaimEachRowOnce(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	const events = 60
	for i := 0; i < events; i++ {
		if _, err := Enqueue(ctx, db, Event{Actor: "a", Action: "test.claim", Service: "test"}); err != nil {
			t.Fatal(err)
		}
	}

	store := NewStore(db)
	var mu sync.Mutex
	seen := map[int64]int{}
	var wg sync.WaitGroup
	for r := 0; r < 4; r++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for {
				batch, err := store.Claim(ctx, 7, time.Minute)
				if err != nil {
					t.Error(err)
					return
				}
				if len(batch) == 0 {
					return
				}
				mu.Lock()
				for _, p := range batch {
					seen[p.ID]++
				}
				mu.Unlock()
			}
		}()
	}
	wg.Wait()

	if len(seen) != events {
		t.Fatalf("claimed %d distinct rows, want %d", len(seen), events)
	}
	for id, n := range seen {
		if n != 1 {
			t.Fatalf("row %d claimed %d times", id, n)
		}
	}
}

// The whole loop against a stand-in audit-trail that dedupes on id the way
// the real one does: a delivery whose acknowledgement was lost is sent again,
// and the trail still holds the event once.
func TestIntegrationRelayRedeliveryIsRecordedOnce(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()

	var mu sync.Mutex
	recorded := map[string]int{}
	failNext := true
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body struct {
			ID string `json:"id"`
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		mu.Lock()
		defer mu.Unlock()
		if _, dup := recorded[body.ID]; dup {
			w.WriteHeader(http.StatusOK)
			return
		}
		recorded[body.ID]++
		if failNext {
			// Recorded, but the acknowledgement is "lost": the relay sees a
			// 502 and must try again.
			failNext = false
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()

	id, err := Enqueue(ctx, db, Event{Actor: "a", Action: "test.redeliver", Service: "test"})
	if err != nil {
		t.Fatal(err)
	}

	relay := NewRelay(NewStore(db), NewHTTPPublisher(srv.URL, ""), discard()).WithMetrics(NewMetrics())
	relay.BackoffMin, relay.BackoffMax = time.Millisecond, time.Millisecond

	if n, err := relay.RunOnce(ctx); err != nil || n != 0 {
		t.Fatalf("first pass = %d, %v; want 0 delivered", n, err)
	}
	if count(t, db, "status = 'PENDING' AND attempts = 1 AND last_error <> ''") != 1 {
		t.Fatal("a failed delivery should leave the row pending with its error")
	}

	time.Sleep(20 * time.Millisecond)
	if n, err := relay.RunOnce(ctx); err != nil || n != 1 {
		t.Fatalf("second pass = %d, %v; want 1 delivered", n, err)
	}
	if count(t, db, fmt.Sprintf("event_id = '%s' AND status = 'DELIVERED' AND delivered_at IS NOT NULL", id)) != 1 {
		t.Fatal("row not marked delivered")
	}
	if recorded[id] != 1 {
		t.Fatalf("event recorded %d times, want 1", recorded[id])
	}
}

func TestIntegrationRefusedEventIsDeadLettered(t *testing.T) {
	db := testDB(t)
	ctx := context.Background()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	if _, err := Enqueue(ctx, db, Event{Actor: "a", Action: "test.refused", Service: "test"}); err != nil {
		t.Fatal(err)
	}
	relay := NewRelay(NewStore(db), NewHTTPPublisher(srv.URL, "wrong"), discard())
	if _, err := relay.RunOnce(ctx); err != nil {
		t.Fatal(err)
	}
	if count(t, db, "status = 'DEAD' AND last_error LIKE '%401%'") != 1 {
		t.Fatal("a refused event should be dead-lettered with the reason")
	}
}
