package bridge

import (
	"errors"
	"fmt"
	"testing"
)

// The classification decides between "try again" and "give the money back",
// so each case here is a real error string one of the two chains produces.
func TestClassify(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want Class
	}{
		{"nil", nil, ClassTransient},

		// Transient: the chain never answered, so nothing is known about
		// whether the call landed. Compensating on these is what un-minted
		// healthy transfers before P2.
		{"connection refused",
			errors.New("dial tcp 127.0.0.1:8545: connect: connection refused"), ClassTransient},
		{"finality timeout",
			fmt.Errorf("timed out waiting for tx 0xabc to finalize: %w", deadlineExceeded()), ClassTransient},
		{"rate limited",
			errors.New("429 Too Many Requests"), ClassTransient},
		{"unrecognised",
			errors.New("something nobody has seen before"), ClassTransient},

		// Terminal: the chain answered, and the answer will not change.
		{"ethereum revert",
			errors.New("bridgeMint tx: execution reverted: Pausable: paused"), ClassTerminal},
		{"blacklisted",
			errors.New("execution reverted: account is blacklisted"), ClassTerminal},
		{"lost the role",
			errors.New("execution reverted: AccessControl: account 0x.. is missing role"), ClassTerminal},
		{"anchor error",
			errors.New("tx 3x failed: custom program error: 0x1771"), ClassTerminal},
		{"no delegate",
			errors.New("custom program error: Owner has not delegated burn authority"), ClassTerminal},
		{"relayer out of gas",
			errors.New("insufficient funds for gas * price + value"), ClassTerminal},

		// Already processed: proof the call landed. Never a failure.
		{"ethereum replay guard",
			errors.New("execution reverted: already minted"), ClassAlreadyProcessed},
		{"ethereum burn replay guard",
			errors.New("bridgeBurn tx: execution reverted: already burned"), ClassAlreadyProcessed},
		{"anchor init on an existing marker",
			errors.New("Allocate: account Address { .. } already in use"), ClassAlreadyProcessed},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := Classify(tc.err); got != tc.want {
				t.Fatalf("Classify(%v) = %v, want %v", tc.err, got, tc.want)
			}
		})
	}
}

// A replay guard is still a revert, so the ordering inside Classify is what
// keeps "already minted" from being read as a terminal failure — and a
// terminal failure on a bridge is what triggers compensation.
func TestReplayGuardBeatsRevert(t *testing.T) {
	err := errors.New("execution reverted: already minted")
	if got := Classify(err); got != ClassAlreadyProcessed {
		t.Fatalf("Classify = %v, want ClassAlreadyProcessed; a replay guard must never trigger compensation", got)
	}
}

func deadlineExceeded() error { return errors.New("context deadline exceeded") }
