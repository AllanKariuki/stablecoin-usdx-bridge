package config

import "testing"

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
