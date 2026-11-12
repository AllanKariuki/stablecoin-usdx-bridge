package audit

import (
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"testing"

	trail "github.com/AllanKariuki/stablecoin-usdx-bridge/shared/go/platform/audit"
)

// trailRows reads the audit_outbox events for one signatures row.
func trailRows(t *testing.T, log *Log, recordID string) []map[string]any {
	t.Helper()
	rows, err := log.db.Query(`SELECT payload::text FROM audit_outbox WHERE event_id = $1 ORDER BY id`, "signer:"+recordID)
	if err != nil {
		t.Fatalf("reading audit_outbox: %v", err)
	}
	defer rows.Close()
	var out []map[string]any
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			t.Fatal(err)
		}
		var p map[string]any
		if err := json.Unmarshal([]byte(raw), &p); err != nil {
			t.Fatal(err)
		}
		out = append(out, p)
	}
	return out
}

func TestEveryAppendIsAlsoAnAuditTrailEvent(t *testing.T) {
	log, ctx := testLog(t)

	allowed := record(uniqueCorrelation(t)+"-ok", OutcomeAllowed, "700")
	denied := record(uniqueCorrelation(t)+"-no", OutcomeDenied, "700")
	for _, r := range []*Record{allowed, denied} {
		if err := log.Append(ctx, r); err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	for _, c := range []struct {
		r       *Record
		action  string
		outcome string
	}{
		{allowed, TrailActionAllowed, "SUCCESS"},
		{denied, TrailActionDenied, "DENIED"},
	} {
		events := trailRows(t, log, c.r.ID)
		if len(events) != 1 {
			t.Fatalf("%d trail events for %s, want 1", len(events), c.r.Outcome)
		}
		e := events[0]
		meta, _ := e["metadata"].(map[string]any)
		after, _ := e["after_state"].(map[string]any)
		if e["action"] != c.action || e["outcome"] != c.outcome || e["actor"] != "core-ledger-worker" ||
			e["service"] != "signer" || meta["hash"] != c.r.Hash || after["correlation_id"] != c.r.CorrelationID {
			t.Fatalf("trail event = %v", e)
		}
	}
}

// A refused append writes no signatures row, so it must write no trail event
// either: the two commit or roll back together.
func TestARefusedAppendLeavesNoAuditTrailEvent(t *testing.T) {
	log, ctx := testLog(t)
	correlation := uniqueCorrelation(t)
	if err := log.Append(ctx, record(correlation, OutcomeAllowed, "500")); err != nil {
		t.Fatal(err)
	}
	other := record(correlation, OutcomeAllowed, "900")
	other.ID = "refused-" + correlation
	other.Digest = "0ther"
	if err := log.Append(ctx, other); !errors.Is(err, ErrPayloadMismatch) {
		t.Fatalf("err = %v, want ErrPayloadMismatch", err)
	}
	if got := trailRows(t, log, other.ID); len(got) != 0 {
		t.Fatalf("a refused append left %d trail events", len(got))
	}
}

func TestAuditOutboxMigrationMatchesTheSharedSchema(t *testing.T) {
	raw, err := migrationsFS.ReadFile("migrations/00003_audit_outbox.sql")
	if err != nil {
		t.Fatal(err)
	}
	comment := regexp.MustCompile(`--[^\n]*`)
	space := regexp.MustCompile(`\s+`)
	norm := func(s string) string {
		return strings.TrimSpace(space.ReplaceAllString(comment.ReplaceAllString(s, ""), " "))
	}
	up := strings.SplitN(string(raw), "-- +goose Down", 2)[0]
	if norm(up) != norm(trail.Schema) {
		t.Fatalf("migrations/00003_audit_outbox.sql has drifted from audit.Schema:\n%s\nvs\n%s", norm(up), norm(trail.Schema))
	}
}
