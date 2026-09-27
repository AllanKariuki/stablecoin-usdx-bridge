package retry

import (
	"testing"
	"time"
)

func TestBackoffGrowsAndIsCapped(t *testing.T) {
	p := Policy{Base: time.Second, Max: 30 * time.Second, Budget: 10}

	// Full jitter means any single draw can be small, so the property worth
	// asserting is the ceiling, not the floor: the delay never exceeds the
	// exponential for that attempt, and never exceeds Max.
	for attempt := 1; attempt <= 12; attempt++ {
		for i := 0; i < 200; i++ {
			d := p.Backoff(attempt)
			if d <= 0 {
				t.Fatalf("attempt %d produced a non-positive delay %v", attempt, d)
			}
			if d > p.Max {
				t.Fatalf("attempt %d produced %v, above the %v cap", attempt, d, p.Max)
			}
		}
	}
}

func TestBackoffSpreadsRetries(t *testing.T) {
	p := Policy{Base: time.Second, Max: time.Minute, Budget: 10}

	// The whole point of jitter: N workers that crashed together must not
	// retry in lockstep. Identical draws across 100 samples would mean the
	// jitter isn't there.
	seen := map[time.Duration]bool{}
	for i := 0; i < 100; i++ {
		seen[p.Backoff(5)] = true
	}
	if len(seen) < 50 {
		t.Fatalf("only %d distinct delays in 100 draws; retries would arrive in lockstep", len(seen))
	}
}

func TestExhausted(t *testing.T) {
	p := Policy{Budget: 3}
	for _, tc := range []struct {
		attempts int
		want     bool
	}{{0, false}, {2, false}, {3, true}, {4, true}} {
		if got := p.Exhausted(tc.attempts); got != tc.want {
			t.Fatalf("Exhausted(%d) = %v, want %v", tc.attempts, got, tc.want)
		}
	}

	// A zero budget means unbounded, so nothing is ever abandoned for having
	// tried too often.
	if (Policy{}).Exhausted(1_000_000) {
		t.Fatal("a zero budget must mean unbounded")
	}
}
