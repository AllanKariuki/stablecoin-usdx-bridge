package ledger

import "testing"

func TestParseDecimalAmount(t *testing.T) {
	cases := []struct {
		in      string
		want    string // expected smallest-unit value, as a string
		wantErr bool
	}{
		{in: "1000000.00", want: "1000000000000"},
		{in: "1000000", want: "1000000000000"},
		{in: "0.5", want: "500000"},
		{in: "0.000001", want: "1"},
		{in: ".5", want: "500000"},
		{in: "-10.25", want: "-10250000"},
		{in: "0", want: "0"},
		{in: "1.0000001", wantErr: true}, // more than 6 decimal places
		{in: "not-a-number", wantErr: true},
		{in: "", wantErr: true},
	}

	for _, c := range cases {
		got, err := ParseDecimalAmount(c.in)
		if c.wantErr {
			if err == nil {
				t.Errorf("ParseDecimalAmount(%q): expected error, got %s", c.in, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("ParseDecimalAmount(%q): unexpected error: %v", c.in, err)
			continue
		}
		if got.String() != c.want {
			t.Errorf("ParseDecimalAmount(%q) = %s, want %s", c.in, got.String(), c.want)
		}
	}
}
