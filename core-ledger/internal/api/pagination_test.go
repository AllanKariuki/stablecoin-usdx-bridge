package api

import (
	"testing"
	"time"
)

func TestTxCursor_RoundTrips(t *testing.T) {
	want := time.Date(2026, 9, 23, 12, 0, 0, 123456789, time.UTC)
	cursor := encodeTxCursor(want, "tx-abc-123")

	gotTime, gotID, err := decodeTxCursor(cursor)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !gotTime.Equal(want) {
		t.Errorf("time round-trip: got %v, want %v", gotTime, want)
	}
	if gotID != "tx-abc-123" {
		t.Errorf("id round-trip: got %q, want %q", gotID, "tx-abc-123")
	}
}

func TestTxCursor_EmptyDecodesToZeroPosition(t *testing.T) {
	gotTime, gotID, err := decodeTxCursor("")
	if err != nil {
		t.Fatalf("unexpected error decoding an empty cursor: %v", err)
	}
	if !gotTime.IsZero() || gotID != "" {
		t.Errorf("expected the zero position for an empty cursor, got (%v, %q)", gotTime, gotID)
	}
}

func TestTxCursor_MalformedRejected(t *testing.T) {
	for _, bad := range []string{"not-base64!!!", "aGVsbG8", "YQ"} { // "hello" b64, single char b64 — neither is "ts|id"
		if _, _, err := decodeTxCursor(bad); err == nil {
			t.Errorf("expected %q to be rejected as malformed, got no error", bad)
		}
	}
}

func TestAccountCursor_RoundTrips(t *testing.T) {
	cursor := encodeAccountCursor("2100.USDX.wallet-abc")
	got, err := decodeAccountCursor(cursor)
	if err != nil {
		t.Fatalf("decode: %v", err)
	}
	if got != "2100.USDX.wallet-abc" {
		t.Errorf("got %q, want %q", got, "2100.USDX.wallet-abc")
	}
}

func TestClampLimit(t *testing.T) {
	cases := []struct {
		requested, def, max, want int
	}{
		{requested: 0, def: 50, max: 200, want: 50},
		{requested: -5, def: 50, max: 200, want: 50},
		{requested: 10, def: 50, max: 200, want: 10},
		{requested: 5000, def: 50, max: 200, want: 200},
	}
	for _, c := range cases {
		if got := clampLimit(c.requested, c.def, c.max); got != c.want {
			t.Errorf("clampLimit(%d, %d, %d) = %d, want %d", c.requested, c.def, c.max, got, c.want)
		}
	}
}
