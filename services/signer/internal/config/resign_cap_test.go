package config

import (
	"testing"
	"time"
)

// A negative cap fails boot. Read as "unlimited" it would undo the cap; read
// as zero it would quietly stop every retry that needs a rebuilt transaction.
func TestResignCapRefusesNegative(t *testing.T) {
	for _, tc := range []struct {
		in      int
		wantErr bool
	}{{0, false}, {5, false}, {-1, true}} {
		got, err := Config{MaxResigns: tc.in}.ResignCap()
		if (err != nil) != tc.wantErr {
			t.Fatalf("ResignCap(%d) err = %v, wantErr %v", tc.in, err, tc.wantErr)
		}
		if err == nil && got != tc.in {
			t.Fatalf("ResignCap(%d) = %d", tc.in, got)
		}
	}
}

// A non-positive allowance TTL fails boot: a grant that expires as it is
// issued turns a runtime raise into a silent no-op, which is the failure
// mode nobody checks again until the saga is still parked.
func TestResignAllowanceTTLRefusesNonPositive(t *testing.T) {
	for _, tc := range []struct {
		ttl     time.Duration
		wantErr bool
	}{{24 * time.Hour, false}, {time.Minute, false}, {0, true}, {-time.Hour, true}} {
		_, err := Config{ResignAllowanceTTL: tc.ttl}.ResignAllowanceTTLSeconds()
		if (err != nil) != tc.wantErr {
			t.Fatalf("ResignAllowanceTTLSeconds(%s) err = %v, wantErr %v", tc.ttl, err, tc.wantErr)
		}
	}
}
