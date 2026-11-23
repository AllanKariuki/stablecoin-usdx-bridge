package config

import (
	"strings"
	"testing"
)

// The rule that keeps an open ingest surface out of every environment but
// local: recording is the only write on this service, and it is permanent.
func TestRequireIngestToken(t *testing.T) {
	cases := []struct {
		name    string
		env     string
		token   string
		wantErr bool
	}{
		{"local with no token may start", "local", "", false},
		{"local with a token", "local", "s3cret", false},
		{"staging with no token refuses", "staging", "", true},
		{"production with no token refuses", "production", "", true},
		{"staging with a token", "staging", "s3cret", false},
		{"unset env is not local", "", "", true},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := Config{Env: tc.env, IngestToken: tc.token}.RequireIngestToken()
			if tc.wantErr {
				if err == nil {
					t.Fatal("want an error, got nil")
				}
				if !strings.Contains(err.Error(), "INGEST_TOKEN") {
					t.Fatalf("error should name the missing variable, got %q", err)
				}
				return
			}
			if err != nil {
				t.Fatalf("want no error, got %v", err)
			}
		})
	}
}
