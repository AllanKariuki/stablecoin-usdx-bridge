// Package retry holds the one backoff policy core-ledger's durable work uses,
// so the outbox relay and the bridge saga can't drift into two different ideas
// of how long "try again later" is.
package retry

import (
	"math"
	"math/rand"
	"time"
)

// Policy bounds how hard and how long something is retried before it is
// someone's problem instead of the process's.
type Policy struct {
	// Base is the delay after the first failure; each subsequent attempt
	// doubles it up to Max.
	Base time.Duration
	Max  time.Duration

	// Budget is the total number of attempts allowed. Once it is spent the
	// work is dead-lettered rather than retried forever — an unbounded retry
	// of a permanently broken call is an outage that never pages anyone.
	Budget int
}

// Backoff returns how long to wait before attempt number `attempt`
// (1-based: attempt 1 has already failed when this is called).
//
// The jitter is full jitter — a uniform draw from [0, exponential) rather than
// the exponential plus a small wobble. N workers that crashed together and
// restarted together would otherwise retry in lockstep forever, and a
// synchronised retry storm is how a recovering dependency gets knocked over a
// second time.
func (p Policy) Backoff(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	base := p.Base
	if base <= 0 {
		base = time.Second
	}
	max := p.Max
	if max <= 0 || max < base {
		max = base
	}

	exp := float64(base) * math.Pow(2, float64(attempt-1))
	if exp > float64(max) {
		exp = float64(max)
	}
	return time.Duration(rand.Int63n(int64(exp)) + 1)
}

// Exhausted reports whether an attempt count has spent the budget.
func (p Policy) Exhausted(attempts int) bool {
	return p.Budget > 0 && attempts >= p.Budget
}
