package api

import (
	"testing"

	"github.com/AllanKariuki/stablecoin-usdx-bridge/services/signer/internal/audit"
)

// Re-signs of one payload are bounded. Past the cap the request is refused
// with its own code — core-ledger parks on it — and the key backend is never
// asked, so a capped request costs no signature. Replays are not re-signs:
// they produce nothing new, and stay available past the cap.
func TestSignCapsResignsPerCorrelation(t *testing.T) {
	log, backend := &memLog{maxResigns: 2}, &fakeBackend{}
	app := newApp(log, backend)

	first := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", 1))
	if first.status != 200 {
		t.Fatalf("first sign: %+v", first)
	}
	for nonce := uint64(2); nonce <= 3; nonce++ {
		if got := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", nonce)); got.status != 200 {
			t.Fatalf("re-sign at nonce %d: %+v, want 200 (within the cap of 2)", nonce, got)
		}
	}

	capped := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", 4))
	if capped.status != 409 || capped.code != "RESIGN_LIMIT_REACHED" || capped.sig != "" {
		t.Fatalf("third re-sign: %+v, want 409 RESIGN_LIMIT_REACHED with no signature", capped)
	}
	if backend.signed != 3 {
		t.Fatalf("the backend signed %d times, want 3; a capped request must not reach it", backend.signed)
	}
	if log.count(audit.OutcomeDenied) != 1 {
		t.Fatal("the capped request was not recorded as a denial")
	}

	replay := post(t, app, ethMint(t, usdxProxy, 1000, "corr-1", "corr-1", 1))
	if replay.status != 200 || !replay.replayed || replay.sig != first.sig {
		t.Fatalf("a byte-identical replay past the cap: %+v, want the original signature", replay)
	}
	// The cap is per correlation id: another movement is untouched by it.
	if other := post(t, app, ethMint(t, usdxProxy, 400, "corr-2", "corr-2", 5)); other.status != 200 {
		t.Fatalf("an unrelated correlation: %+v, want 200", other)
	}
}

// The pre-check can be raced by another replica's re-sign; the append has the
// last word, and its refusal withholds the signature just as the check would.
func TestSignWithholdsTheSignatureWhenAnotherReplicaTookTheLastResign(t *testing.T) {
	log, backend := &memLog{}, &fakeBackend{}
	app := newApp(log, backend)
	if got := post(t, app, ethMint(t, usdxProxy, 10, "corr-1", "corr-1", 1)); got.status != 200 {
		t.Fatalf("first sign: %+v", got)
	}

	log.appendErr = audit.ErrResignLimit
	got := post(t, app, ethMint(t, usdxProxy, 10, "corr-1", "corr-1", 2))
	if got.status != 409 || got.code != "RESIGN_LIMIT_REACHED" || got.sig != "" {
		t.Fatalf("got %+v, want 409 RESIGN_LIMIT_REACHED with no signature", got)
	}
}
