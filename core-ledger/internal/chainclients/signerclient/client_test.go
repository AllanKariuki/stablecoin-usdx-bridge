package signerclient

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

// The saga recognises a refusal by its type alone, so the status-and-code to
// type mapping is the whole of the contract between the two services. A
// refusal that comes back untyped is retried until the budget runs out; a
// failure that comes back as a refusal is parked for a human when one more
// attempt would have done.
func TestSignTypesEachRefusal(t *testing.T) {
	cases := []struct {
		name   string
		status int
		body   string
		check  func(error) bool
	}{
		{"policy denial", http.StatusForbidden, `{"error":"over the ceiling","code":"POLICY_DENIED"}`,
			func(err error) bool {
				var e *PolicyDeniedError
				return errors.As(err, &e) && e.Reason == "over the ceiling"
			}},
		{"correlation reused", http.StatusConflict, `{"error":"bound elsewhere","code":"CORRELATION_REUSED"}`,
			func(err error) bool {
				var e *CorrelationReusedError
				return errors.As(err, &e) && e.Reason == "bound elsewhere"
			}},
		{"re-sign limit", http.StatusConflict, `{"error":"5 re-signs","code":"RESIGN_LIMIT_REACHED"}`,
			func(err error) bool { var e *ResignLimitError; return errors.As(err, &e) && e.Reason == "5 re-signs" }},

		// Not refusals: these must stay ordinary errors so the saga retries
		// them. An unknown 409 code is the case worth pinning — a signer that
		// grows a new code must not have it guessed terminal here.
		{"unknown 409 code", http.StatusConflict, `{"error":"?","code":"SOMETHING_NEW"}`, isUntyped},
		{"audit write failed", http.StatusInternalServerError, `{"code":"AUDIT_WRITE_FAILED"}`, isUntyped},
		{"backend down", http.StatusBadGateway, `{"code":"SIGNING_FAILED"}`, isUntyped},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tc.status)
				_, _ = w.Write([]byte(tc.body))
			}))
			defer srv.Close()

			client, err := New(srv.URL, "", "", "")
			if err != nil {
				t.Fatal(err)
			}
			_, err = client.Sign(context.Background(), SignRequest{Chain: "ETHEREUM", CorrelationID: "c"})
			if err == nil || !tc.check(err) {
				t.Fatalf("Sign returned %T %v", err, err)
			}
		})
	}
}

func isUntyped(err error) bool {
	var (
		denied *PolicyDeniedError
		reused *CorrelationReusedError
		capped *ResignLimitError
	)
	return !errors.As(err, &denied) && !errors.As(err, &reused) && !errors.As(err, &capped)
}
